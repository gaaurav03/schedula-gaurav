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
import { Appointment, AppointmentStatus, AppointmentType } from '../appointment/entities/appointment.entity';

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

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
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

  // ─── Unified Available Schedule ────────────────────────────────────────────

  /**
   * GET /patient/schedule/available?doctorId=&date=YYYY-MM-DD
   *
   * THE single unified endpoint for patients. Returns ALL bookable sessions
   * for a doctor on a given date — regardless of how the doctor created them.
   *
   * Step 1: Look for directly-created STREAM + WAVE sessions already in DB
   * Step 2: Check availability templates (custom override > recurring weekly)
   *         and auto-create sessions for uncovered time windows
   * Step 3: Merge and return everything in one response
   */
  async getAvailableSchedule(doctorId: string, date: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD (e.g. 2026-07-30).');
    }

    const sessions: object[] = [];
    const coveredWindows = new Set<string>(); // track windows already in sessions

    // ── Step 1a: Directly-created STREAM sessions ──────────────────────────
    const existingStreams = await this.streamScheduleRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });

    for (const s of existingStreams) {
      coveredWindows.add(`${s.startTime}-${s.endTime}`);
      sessions.push({
        appointmentType: 'STREAM',
        resolvedFrom: s.schedulingType,
        timeWindow: `${s.startTime} - ${s.endTime}`,
        startTime: s.startTime,
        endTime: s.endTime,
        streamId: s.id,
        tokensAvailable: s.maxPatients - s.currentCount,
        totalCapacity: s.maxPatients,
        isFull: s.currentCount >= s.maxPatients,
      });
    }

    // ── Step 1b: Directly-created WAVE sessions ────────────────────────────
    const existingWaves = await this.waveScheduleRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });

    for (const w of existingWaves) {
      coveredWindows.add(`${w.startTime}-${w.endTime}`);
      const availableSlots = await this.waveSlotRepo.find({
        where: { waveId: w.id, isBooked: false },
        order: { slotStart: 'ASC' },
      });
      sessions.push({
        appointmentType: 'WAVE',
        resolvedFrom: w.schedulingType,
        timeWindow: `${w.startTime} - ${w.endTime}`,
        startTime: w.startTime,
        endTime: w.endTime,
        waveId: w.id,
        availableSlots: availableSlots.map((sl) => ({
          id: sl.id,
          slotTime: `${sl.slotStart} - ${sl.slotEnd}`,
          startTime: sl.slotStart,
          endTime: sl.slotEnd,
        })),
        slotsRemaining: availableSlots.length,
      });
    }

    // ── Step 2a: Custom overrides for this specific date ────────────────────
    const customOverrides = await this.customAvailabilityRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });

    if (customOverrides.length > 0) {
      const availableOverrides = customOverrides.filter((c) => c.isAvailable);
      // Doctor explicitly blocked this entire day with no direct sessions
      if (availableOverrides.length === 0 && sessions.length === 0) {
        return { available: false, date, reason: 'Doctor has marked this date as unavailable.' };
      }

      for (const c of availableOverrides) {
        const key = `${c.startTime}-${c.endTime}`;
        if (coveredWindows.has(key)) continue;
        coveredWindows.add(key);

        if (c.schedulingMode === SchedulingMode.STREAM && c.maxPatients) {
          const session = await this.streamScheduleRepo.save(
            this.streamScheduleRepo.create({
              doctorId, date, startTime: c.startTime, endTime: c.endTime,
              maxPatients: c.maxPatients, currentCount: 0,
              schedulingType: SchedulingType.CUSTOM,
            }),
          );
          sessions.push({
            appointmentType: 'STREAM', resolvedFrom: 'CUSTOM',
            timeWindow: `${c.startTime} - ${c.endTime}`,
            startTime: c.startTime, endTime: c.endTime,
            streamId: session.id,
            tokensAvailable: session.maxPatients,
            totalCapacity: session.maxPatients,
            isFull: false,
          });
        } else if (c.schedulingMode === SchedulingMode.WAVE && c.slotDurationMins) {
          const waveSchedule = await this.waveScheduleRepo.save(
            this.waveScheduleRepo.create({
              doctorId, date, startTime: c.startTime, endTime: c.endTime,
              slotDurationMins: c.slotDurationMins, bufferTimeMins: c.bufferTimeMins ?? 0,
              schedulingType: SchedulingType.CUSTOM,
            }),
          );
          await this.waveSlotRepo.save(
            buildWaveSlots(waveSchedule.id, doctorId, date, c.startTime, c.endTime,
              c.slotDurationMins, c.bufferTimeMins ?? 0),
          );
          const slots = await this.waveSlotRepo.find({
            where: { waveId: waveSchedule.id, isBooked: false },
            order: { slotStart: 'ASC' },
          });
          sessions.push({
            appointmentType: 'WAVE', resolvedFrom: 'CUSTOM',
            timeWindow: `${c.startTime} - ${c.endTime}`,
            startTime: c.startTime, endTime: c.endTime,
            waveId: waveSchedule.id,
            availableSlots: slots.map((sl) => ({
              id: sl.id, slotTime: `${sl.slotStart} - ${sl.slotEnd}`,
              startTime: sl.slotStart, endTime: sl.slotEnd,
            })),
            slotsRemaining: slots.length,
          });
        }
      }
    } else {
      // ── Step 2b: No custom override → check recurring template for weekday ──
      const [year, month, day] = date.split('-').map(Number);
      const dayOfWeek = DAY_MAP[new Date(year, month - 1, day).getDay()];

      const recurring = await this.recurringAvailabilityRepo.find({
        where: { doctorId, dayOfWeek },
        order: { startTime: 'ASC' },
      });

      for (const r of recurring) {
        const key = `${r.startTime}-${r.endTime}`;
        if (coveredWindows.has(key)) continue;
        coveredWindows.add(key);

        if (r.schedulingMode === SchedulingMode.STREAM && r.maxPatients) {
          const session = await this.streamScheduleRepo.save(
            this.streamScheduleRepo.create({
              doctorId, date, startTime: r.startTime, endTime: r.endTime,
              maxPatients: r.maxPatients, currentCount: 0,
              schedulingType: SchedulingType.RECURRING,
              recurringAvailabilityId: r.id,  // ← elastic scheduling FK
            }),
          );
          sessions.push({
            appointmentType: 'STREAM', resolvedFrom: 'RECURRING',
            timeWindow: `${r.startTime} - ${r.endTime}`,
            startTime: r.startTime, endTime: r.endTime,
            streamId: session.id,
            tokensAvailable: session.maxPatients,
            totalCapacity: session.maxPatients,
            isFull: false,
          });
        } else if (r.schedulingMode === SchedulingMode.WAVE && r.slotDurationMins) {
          const waveSchedule = await this.waveScheduleRepo.save(
            this.waveScheduleRepo.create({
              doctorId, date, startTime: r.startTime, endTime: r.endTime,
              slotDurationMins: r.slotDurationMins, bufferTimeMins: r.bufferTimeMins ?? 0,
              schedulingType: SchedulingType.RECURRING,
              recurringAvailabilityId: r.id,  // ← elastic scheduling FK
            }),
          );
          await this.waveSlotRepo.save(
            buildWaveSlots(waveSchedule.id, doctorId, date, r.startTime, r.endTime,
              r.slotDurationMins, r.bufferTimeMins ?? 0),
          );
          const slots = await this.waveSlotRepo.find({
            where: { waveId: waveSchedule.id, isBooked: false },
            order: { slotStart: 'ASC' },
          });
          sessions.push({
            appointmentType: 'WAVE', resolvedFrom: 'RECURRING',
            timeWindow: `${r.startTime} - ${r.endTime}`,
            startTime: r.startTime, endTime: r.endTime,
            waveId: waveSchedule.id,
            availableSlots: slots.map((sl) => ({
              id: sl.id, slotTime: `${sl.slotStart} - ${sl.slotEnd}`,
              startTime: sl.slotStart, endTime: sl.slotEnd,
            })),
            slotsRemaining: slots.length,
          });
        }
      }
    }

    if (sessions.length === 0) {
      return { available: false, date, reason: 'Doctor has no availability configured for this date.' };
    }

    return { available: true, date, totalSessions: sessions.length, sessions };
  }

  // ─── STREAM: Token-Based Patient Booking ─────────────────────────────────

  /**
   * POST /patient/schedule/stream/:streamId/book
   * Book into a STREAM session → receive sequential token number.
   * Also creates a unified Appointment record.
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
    const savedBooking = await this.streamBookingRepo.save(
      this.streamBookingRepo.create({
        streamId,
        patientId: patient.id,
        tokenNumber,
        bookedAt: new Date(),
      }),
    );

    stream.currentCount += 1;
    await this.streamScheduleRepo.save(stream);

    // Create unified appointment record so it appears in GET /appointment/my
    await this.appointmentRepo.save(
      this.appointmentRepo.create({
        doctorId: stream.doctorId,
        patientId: patient.id,
        date: stream.date,
        startTime: stream.startTime,
        endTime: stream.endTime,
        status: AppointmentStatus.BOOKED,
        appointmentType: AppointmentType.STREAM,
        schedulingType: stream.schedulingType,
        tokenNumber,
        streamBookingId: savedBooking.id,
        waveSlotId: null,
        cancelledAt: null,
      }),
    );

    return {
      message: 'Stream booking confirmed! Please arrive within the time window.',
      appointmentType: 'STREAM',
      schedulingType: stream.schedulingType,
      timeWindow: `${stream.startTime} - ${stream.endTime}`,
      date: stream.date,
      tokenNumber,
      tokensRemaining: `${stream.maxPatients - stream.currentCount}/${stream.maxPatients} remaining`,
    };
  }

  // ─── WAVE: Exact Slot Patient Booking ────────────────────────────────────

  /**
   * POST /patient/schedule/wave/:slotId/book
   * Book an exact WAVE slot → receive confirmed appointment time.
   * Also creates a unified Appointment record.
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
        `You already have a booking in this schedule at ${alreadyBooked.slotStart}-${alreadyBooked.slotEnd}.`,
      );
    }

    slot.isBooked = true;
    slot.patientId = patient.id;
    slot.bookedAt = new Date();
    await this.waveSlotRepo.save(slot);

    // Create unified appointment record so it appears in GET /appointment/my
    await this.appointmentRepo.save(
      this.appointmentRepo.create({
        doctorId: slot.doctorId,
        patientId: patient.id,
        date: slot.date,
        startTime: slot.slotStart,
        endTime: slot.slotEnd,
        status: AppointmentStatus.BOOKED,
        appointmentType: AppointmentType.WAVE,
        schedulingType: slot.wave?.schedulingType ?? SchedulingType.RECURRING,
        tokenNumber: null,
        streamBookingId: null,
        waveSlotId: slot.id,
        cancelledAt: null,
      }),
    );

    return {
      message: 'Appointment confirmed! You have an exact appointment time.',
      appointmentType: 'WAVE',
      schedulingType: slot.wave?.schedulingType ?? null,
      appointmentTime: `${slot.slotStart} - ${slot.slotEnd}`,
      date: slot.date,
    };
  }

  // ─── UNIFIED: Auto-detect & Book ─────────────────────────────────────────

  /**
   * POST /patient/schedule/book
   * Single unified booking endpoint. Patient provides one targetId and the
   * system automatically figures out if it is a WaveSlot or a StreamSchedule.
   *
   * Detection order:
   *  1. Check WaveSlot table  → if found, book as WAVE
   *  2. Check StreamSchedule  → if found, book as STREAM
   *  3. Neither found         → 404 Not Found
   */
  async bookUnified(userId: string, targetId: string) {
    // ── Try WAVE first ──────────────────────────────────────────────────────
    const waveSlot = await this.waveSlotRepo.findOne({ where: { id: targetId } });
    if (waveSlot) {
      return this.bookWaveSlot(userId, targetId);
    }

    // ── Try STREAM ──────────────────────────────────────────────────────────
    const streamSession = await this.streamScheduleRepo.findOne({ where: { id: targetId } });
    if (streamSession) {
      return this.bookStream(userId, targetId);
    }

    // ── Neither found ────────────────────────────────────────────────────────
    throw new NotFoundException(
      `No wave slot or stream session found with id "${targetId}". ` +
      'Use GET /patient/schedule/available to get valid IDs.',
    );
  }
}

