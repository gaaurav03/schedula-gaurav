import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamSchedule, SchedulingType } from '../doctor/entities/stream-schedule.entity';
import { StreamBooking } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveSlot } from '../doctor/entities/wave-booking.entity';
import { RecurringAvailability, DayOfWeek, SchedulingMode } from '../doctor/entities/recurring-availability.entity';
import { CustomAvailability } from '../doctor/entities/custom-availability.entity';
import { PatientProfile } from './entities/patient-profile.entity';

/** Convert "HH:mm" to total minutes from midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes to "HH:mm" string */
function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Map JS Date.getDay() (0=Sun) to DayOfWeek enum */
const DAY_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

/** Auto-generate WaveSlot objects for a wave schedule */
function buildWaveSlots(
  waveId: string,
  doctorId: string,
  date: string,
  startTime: string,
  endTime: string,
  slotDurationMins: number,
  bufferTimeMins: number,
): Partial<WaveSlot>[] {
  const slots: Partial<WaveSlot>[] = [];
  let current = toMinutes(startTime);
  const end = toMinutes(endTime);

  while (current + slotDurationMins <= end) {
    slots.push({
      waveId,
      doctorId,
      date,
      slotStart: fromMinutes(current),
      slotEnd: fromMinutes(current + slotDurationMins),
      isBooked: false,
      patientId: null,
      bookedAt: null,
    });
    current += slotDurationMins + bufferTimeMins;
  }

  return slots;
}

@Injectable()
export class PatientSchedulingService {
  constructor(
    @InjectRepository(StreamSchedule)
    private readonly streamScheduleRepo: Repository<StreamSchedule>,

    @InjectRepository(StreamBooking)
    private readonly streamBookingRepo: Repository<StreamBooking>,

    @InjectRepository(WaveSchedule)
    private readonly waveScheduleRepo: Repository<WaveSchedule>,

    @InjectRepository(WaveSlot)
    private readonly waveSlotRepo: Repository<WaveSlot>,

    @InjectRepository(RecurringAvailability)
    private readonly recurringAvailabilityRepo: Repository<RecurringAvailability>,

    @InjectRepository(CustomAvailability)
    private readonly customAvailabilityRepo: Repository<CustomAvailability>,

    @InjectRepository(PatientProfile)
    private readonly patientProfileRepo: Repository<PatientProfile>,
  ) {}

  // ─── Helper ──────────────────────────────────────────────────────────────

  private async getPatientProfile(userId: string): Promise<PatientProfile> {
    const profile = await this.patientProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(
        'Patient profile not found. Complete onboarding first via POST /patient/profile.',
      );
    }
    return profile;
  }

  // ─── Smart Availability Resolver ─────────────────────────────────────────

  /**
   * GET /patient/schedule/available?doctorId=&date=
   *
   * The single smart entry point for patients. For a given doctor + date:
   *   1. Resolves availability: CUSTOM override > RECURRING fallback
   *   2. If custom marks doctor unavailable → returns { available: false }
   *   3. Auto-creates stream or wave sessions if they don't exist yet
   *   4. Returns all bookable sessions with remaining capacity / slots
   */
  async getAvailableSchedule(doctorId: string, date: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }

    // ── Step 1: Resolve availability ────────────────────────────────────────
    const customSlots = await this.customAvailabilityRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });

    type ResolvedSlot = {
      startTime: string;
      endTime: string;
      schedulingMode: SchedulingMode;
      maxPatients: number | null;
      slotDurationMins: number | null;
      bufferTimeMins: number | null;
    };

    let resolvedSlots: ResolvedSlot[] = [];
    let resolvedFrom: 'CUSTOM' | 'RECURRING';

    if (customSlots.length > 0) {
      // If all custom overrides are "unavailable", block this date
      const available = customSlots.filter((s) => s.isAvailable);
      if (available.length === 0) {
        return {
          available: false,
          date,
          reason: 'Doctor has marked this date as unavailable.',
        };
      }
      resolvedSlots = available as ResolvedSlot[];
      resolvedFrom = 'CUSTOM';
    } else {
      // Fall back to recurring availability for this day of week
      const [year, month, day] = date.split('-').map(Number);
      const dayOfWeek = DAY_MAP[new Date(year, month - 1, day).getDay()];

      const recurring = await this.recurringAvailabilityRepo.find({
        where: { doctorId, dayOfWeek },
        order: { startTime: 'ASC' },
      });

      if (recurring.length === 0) {
        return {
          available: false,
          date,
          reason: 'Doctor has no availability configured for this date.',
        };
      }
      resolvedSlots = recurring as ResolvedSlot[];
      resolvedFrom = 'RECURRING';
    }

    // ── Step 2: For each resolved window, find-or-create the session ─────────
    const sessions: object[] = [];

    for (const slot of resolvedSlots) {
      const { startTime, endTime, schedulingMode, maxPatients, slotDurationMins, bufferTimeMins } = slot;
      const schedulingType =
        resolvedFrom === 'CUSTOM' ? SchedulingType.CUSTOM : SchedulingType.RECURRING;

      if (schedulingMode === SchedulingMode.STREAM) {
        // Find existing stream session or auto-create
        let session = await this.streamScheduleRepo.findOne({
          where: { doctorId, date, startTime, endTime },
        });

        if (!session) {
          session = await this.streamScheduleRepo.save(
            this.streamScheduleRepo.create({
              doctorId,
              date,
              startTime,
              endTime,
              maxPatients: maxPatients!,
              currentCount: 0,
              schedulingType,
            }),
          );
        }

        sessions.push({
          appointmentType: 'STREAM',
          resolvedFrom,
          timeWindow: `${startTime} – ${endTime}`,
          streamId: session.id,
          tokensAvailable: session.maxPatients - session.currentCount,
          totalCapacity: session.maxPatients,
          isFull: session.currentCount >= session.maxPatients,
        });
      } else {
        // WAVE — find existing wave schedule or auto-create with slots
        let waveSchedule = await this.waveScheduleRepo.findOne({
          where: { doctorId, date, startTime, endTime },
        });

        if (!waveSchedule) {
          waveSchedule = await this.waveScheduleRepo.save(
            this.waveScheduleRepo.create({
              doctorId,
              date,
              startTime,
              endTime,
              slotDurationMins: slotDurationMins!,
              bufferTimeMins: bufferTimeMins ?? 0,
              schedulingType,
            }),
          );

          const slotsToCreate = buildWaveSlots(
            waveSchedule.id,
            doctorId,
            date,
            startTime,
            endTime,
            slotDurationMins!,
            bufferTimeMins ?? 0,
          );
          await this.waveSlotRepo.save(slotsToCreate);
        }

        const availableSlots = await this.waveSlotRepo.find({
          where: { waveId: waveSchedule.id, isBooked: false },
          order: { slotStart: 'ASC' },
        });

        sessions.push({
          appointmentType: 'WAVE',
          resolvedFrom,
          waveId: waveSchedule.id,
          timeWindow: `${startTime} – ${endTime}`,
          availableSlots: availableSlots.map((s) => ({
            id: s.id,
            slotTime: `${s.slotStart} – ${s.slotEnd}`,
          })),
        });
      }
    }

    return { available: true, date, sessions };
  }

  // ─── STREAM: Token-Based Patient Booking ─────────────────────────────────

  /**
   * GET /patient/schedule/stream?doctorId=&date=
   * View STREAM sessions for a doctor on a date.
   */
  async getStreamSchedules(doctorId: string, date: string) {
    const streams = await this.streamScheduleRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });

    return {
      type: 'STREAM',
      doctorId,
      date,
      sessions: streams.map((s) => ({
        id: s.id,
        timeWindow: `${s.startTime} – ${s.endTime}`,
        schedulingType: s.schedulingType,
        tokensAvailable: s.maxPatients - s.currentCount,
        totalCapacity: s.maxPatients,
        isFull: s.currentCount >= s.maxPatients,
      })),
    };
  }

  /**
   * POST /patient/schedule/stream/:streamId/book
   * Book into a STREAM session → receive sequential token number.
   */
  async bookStream(userId: string, streamId: string) {
    const patient = await this.getPatientProfile(userId);

    const stream = await this.streamScheduleRepo.findOne({ where: { id: streamId } });
    if (!stream) {
      throw new NotFoundException(`Stream session ${streamId} not found.`);
    }

    if (stream.currentCount >= stream.maxPatients) {
      throw new ConflictException(
        `Stream session is full (${stream.maxPatients}/${stream.maxPatients} tokens issued). No more bookings.`,
      );
    }

    const existing = await this.streamBookingRepo.findOne({
      where: { streamId, patientId: patient.id },
    });
    if (existing) {
      throw new ConflictException(
        `You have already booked this session. Your token number is #${existing.tokenNumber}.`,
      );
    }

    const tokenNumber = stream.currentCount + 1;
    const booking = this.streamBookingRepo.create({
      streamId,
      patientId: patient.id,
      tokenNumber,
      bookedAt: new Date(),
    });
    await this.streamBookingRepo.save(booking);

    stream.currentCount += 1;
    await this.streamScheduleRepo.save(stream);

    return {
      message: 'Stream booking confirmed! Please arrive within the time window.',
      appointmentType: 'STREAM',
      schedulingType: stream.schedulingType,
      timeWindow: `${stream.startTime} – ${stream.endTime}`,
      date: stream.date,
      tokenNumber,
      tokensRemaining: `${stream.maxPatients - stream.currentCount}/${stream.maxPatients} remaining`,
    };
  }

  // ─── WAVE: Exact Slot Patient Booking ────────────────────────────────────

  /**
   * GET /patient/schedule/wave?doctorId=&date=
   * View available exact time slots for a doctor on a date.
   */
  async getAvailableWaveSlots(doctorId: string, date: string) {
    const slots = await this.waveSlotRepo.find({
      where: { doctorId, date, isBooked: false },
      order: { slotStart: 'ASC' },
      relations: ['wave'],
    });

    return {
      type: 'WAVE',
      doctorId,
      date,
      availableSlots: slots.map((slot) => ({
        id: slot.id,
        slotTime: `${slot.slotStart} – ${slot.slotEnd}`,
        schedulingType: slot.wave?.schedulingType ?? null,
        isBooked: slot.isBooked,
      })),
    };
  }

  /**
   * POST /patient/schedule/wave/:slotId/book
   * Book an exact WAVE slot → receive confirmed appointment time.
   */
  async bookWaveSlot(userId: string, slotId: string) {
    const patient = await this.getPatientProfile(userId);

    const slot = await this.waveSlotRepo.findOne({
      where: { id: slotId },
      relations: ['wave'],
    });
    if (!slot) {
      throw new NotFoundException(`Wave slot ${slotId} not found.`);
    }

    if (slot.isBooked) {
      throw new ConflictException(
        'This slot is already booked. Please choose another available slot.',
      );
    }

    const alreadyBooked = await this.waveSlotRepo.findOne({
      where: { waveId: slot.waveId, patientId: patient.id },
    });
    if (alreadyBooked) {
      throw new ConflictException(
        `You already have a booking in this schedule at ${alreadyBooked.slotStart}–${alreadyBooked.slotEnd}.`,
      );
    }

    slot.isBooked = true;
    slot.patientId = patient.id;
    slot.bookedAt = new Date();
    await this.waveSlotRepo.save(slot);

    return {
      message: 'Appointment confirmed! You have an exact appointment time.',
      appointmentType: 'WAVE',
      schedulingType: slot.wave?.schedulingType ?? null,
      appointmentTime: `${slot.slotStart} – ${slot.slotEnd}`,
      date: slot.date,
    };
  }
}
