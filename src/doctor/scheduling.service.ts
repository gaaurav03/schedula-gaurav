import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamSchedule } from './entities/stream-schedule.entity';
import { StreamBooking } from './entities/stream-slot.entity';
import { WaveSchedule } from './entities/wave-schedule.entity';
import { WaveSlot } from './entities/wave-booking.entity';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { CreateStreamScheduleDto } from './dto/create-stream-schedule.dto';
import { CreateWaveScheduleDto } from './dto/create-wave-schedule.dto';

/** Convert "HH:mm" to total minutes from midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes back to "HH:mm" string */
function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

@Injectable()
export class SchedulingService {
  constructor(
    @InjectRepository(StreamSchedule)
    private readonly streamScheduleRepo: Repository<StreamSchedule>,

    @InjectRepository(StreamBooking)
    private readonly streamBookingRepo: Repository<StreamBooking>,

    @InjectRepository(WaveSchedule)
    private readonly waveScheduleRepo: Repository<WaveSchedule>,

    @InjectRepository(WaveSlot)
    private readonly waveSlotRepo: Repository<WaveSlot>,

    @InjectRepository(DoctorProfile)
    private readonly doctorProfileRepo: Repository<DoctorProfile>,
  ) {}

  // ─── Helper ──────────────────────────────────────────────────────────────

  private async getDoctorProfile(userId: string): Promise<DoctorProfile> {
    const profile = await this.doctorProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(
        'Doctor profile not found. Complete onboarding first via POST /doctor/profile.',
      );
    }
    return profile;
  }

  // ─── STREAM Scheduling (Token-Based) ─────────────────────────────────────

  /**
   * POST /doctor/schedule/stream
   * Create a token-based STREAM session.
   * Doctor sets time window + max patients. Patients receive sequential tokens.
   */
  async createStreamSchedule(
    userId: string,
    dto: CreateStreamScheduleDto,
  ): Promise<StreamSchedule> {
    const { date, startTime, endTime, maxPatients, schedulingType } = dto;
    const profile = await this.getDoctorProfile(userId);

    if (toMinutes(startTime) >= toMinutes(endTime)) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}).`,
      );
    }

    const schedule = this.streamScheduleRepo.create({
      doctorId: profile.id,
      date,
      startTime,
      endTime,
      maxPatients,
      currentCount: 0,
      schedulingType,
    });

    return this.streamScheduleRepo.save(schedule);
  }

  /**
   * GET /doctor/schedule/stream
   * List all STREAM sessions for this doctor (with booking details).
   */
  async findAllStreamSchedules(userId: string): Promise<StreamSchedule[]> {
    const profile = await this.getDoctorProfile(userId);
    return this.streamScheduleRepo.find({
      where: { doctorId: profile.id },
      order: { date: 'ASC', startTime: 'ASC' },
      relations: ['bookings'],
    });
  }

  /**
   * GET /doctor/schedule/stream/:id/bookings
   * View all token bookings for a specific STREAM session.
   */
  async getStreamBookings(userId: string, streamId: string): Promise<StreamBooking[]> {
    const profile = await this.getDoctorProfile(userId);
    const schedule = await this.streamScheduleRepo.findOne({
      where: { id: streamId, doctorId: profile.id },
    });
    if (!schedule) {
      throw new NotFoundException(`Stream schedule ${streamId} not found.`);
    }
    return this.streamBookingRepo.find({
      where: { streamId },
      order: { tokenNumber: 'ASC' },
    });
  }

  // ─── WAVE Scheduling (Exact Time Slots) ───────────────────────────────────

  /**
   * POST /doctor/schedule/wave
   * Create an exact slot-based WAVE schedule.
   * Server auto-divides time window into slots based on duration + buffer.
   */
  async createWaveSchedule(
    userId: string,
    dto: CreateWaveScheduleDto,
  ): Promise<WaveSchedule> {
    const { date, startTime, endTime, slotDurationMins, bufferTimeMins = 0, schedulingType } = dto;
    const profile = await this.getDoctorProfile(userId);

    const startMins = toMinutes(startTime);
    const endMins = toMinutes(endTime);

    if (startMins >= endMins) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}).`,
      );
    }

    const totalWindow = endMins - startMins;
    if (slotDurationMins > totalWindow) {
      throw new BadRequestException(
        `slotDurationMins (${slotDurationMins} min) exceeds the available window (${totalWindow} min). No slots can be generated.`,
      );
    }

    // Save schedule first
    const schedule = this.waveScheduleRepo.create({
      doctorId: profile.id,
      date,
      startTime,
      endTime,
      slotDurationMins,
      bufferTimeMins,
      schedulingType,
    });
    const savedSchedule = await this.waveScheduleRepo.save(schedule);

    // Auto-generate exact time slots
    const slotsToSave: Partial<WaveSlot>[] = [];
    let current = startMins;

    while (current + slotDurationMins <= endMins) {
      slotsToSave.push(
        this.waveSlotRepo.create({
          waveId: savedSchedule.id,
          doctorId: profile.id,
          date,
          slotStart: fromMinutes(current),
          slotEnd: fromMinutes(current + slotDurationMins),
          isBooked: false,
          patientId: null,
          bookedAt: null,
        }),
      );
      current += slotDurationMins + bufferTimeMins;
    }

    if (slotsToSave.length === 0) {
      throw new BadRequestException(
        'No slots could be generated. Try reducing slot duration or buffer time.',
      );
    }

    await this.waveSlotRepo.save(slotsToSave);

    return (
      (await this.waveScheduleRepo.findOne({
        where: { id: savedSchedule.id },
        relations: ['slots'],
      })) ?? savedSchedule
    );
  }

  /**
   * GET /doctor/schedule/wave
   * List all WAVE schedules for this doctor (with generated slots).
   */
  async findAllWaveSchedules(userId: string): Promise<WaveSchedule[]> {
    const profile = await this.getDoctorProfile(userId);
    return this.waveScheduleRepo.find({
      where: { doctorId: profile.id },
      order: { date: 'ASC', startTime: 'ASC' },
      relations: ['slots'],
    });
  }

  /**
   * GET /doctor/schedule/wave/:id/slots
   * View all auto-generated slots for a specific WAVE schedule.
   */
  async getWaveSlots(userId: string, waveId: string): Promise<WaveSlot[]> {
    const profile = await this.getDoctorProfile(userId);
    const schedule = await this.waveScheduleRepo.findOne({
      where: { id: waveId, doctorId: profile.id },
    });
    if (!schedule) {
      throw new NotFoundException(`Wave schedule ${waveId} not found.`);
    }
    return this.waveSlotRepo.find({
      where: { waveId },
      order: { slotStart: 'ASC' },
    });
  }
}
