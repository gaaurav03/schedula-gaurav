import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamSchedule } from './entities/stream-schedule.entity';
import { StreamSlot } from './entities/stream-slot.entity';
import { WaveSchedule } from './entities/wave-schedule.entity';
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

    @InjectRepository(StreamSlot)
    private readonly streamSlotRepo: Repository<StreamSlot>,

    @InjectRepository(WaveSchedule)
    private readonly waveScheduleRepo: Repository<WaveSchedule>,

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

  // ─── Stream Scheduling ────────────────────────────────────────────────────

  /**
   * POST /doctor/schedule/stream
   * Create a stream schedule and auto-generate all time slots.
   */
  async createStreamSchedule(
    userId: string,
    dto: CreateStreamScheduleDto,
  ): Promise<StreamSchedule> {
    const { date, startTime, endTime, slotDurationMins, bufferTimeMins = 0 } = dto;
    const profile = await this.getDoctorProfile(userId);

    // Validate time range
    const startMins = toMinutes(startTime);
    const endMins = toMinutes(endTime);

    if (startMins >= endMins) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}).`,
      );
    }

    const totalWindow = endMins - startMins;

    // Ensure at least one slot can be generated
    if (slotDurationMins > totalWindow) {
      throw new BadRequestException(
        `slotDurationMins (${slotDurationMins} min) exceeds the available window (${totalWindow} min). No slots can be generated.`,
      );
    }

    // Generate slots
    const generatedSlots: Partial<StreamSlot>[] = [];
    let current = startMins;

    while (current + slotDurationMins <= endMins) {
      generatedSlots.push({
        doctorId: profile.id,
        date,
        slotStart: fromMinutes(current),
        slotEnd: fromMinutes(current + slotDurationMins),
        isBooked: false,
        patientId: null,
        bookedAt: null,
      });
      current += slotDurationMins + bufferTimeMins;
    }

    if (generatedSlots.length === 0) {
      throw new BadRequestException(
        'No slots could be generated with the given configuration. Try reducing slot duration or buffer time.',
      );
    }

    // Save schedule
    const schedule = this.streamScheduleRepo.create({
      doctorId: profile.id,
      date,
      startTime,
      endTime,
      slotDurationMins,
      bufferTimeMins,
    });
    const savedSchedule = await this.streamScheduleRepo.save(schedule);

    // Attach scheduleId and save slots
    const slotsToSave = generatedSlots.map((s) =>
      this.streamSlotRepo.create({ ...s, scheduleId: savedSchedule.id }),
    );
    await this.streamSlotRepo.save(slotsToSave);

    return (
      (await this.streamScheduleRepo.findOne({
        where: { id: savedSchedule.id },
        relations: ['slots'],
      })) ?? savedSchedule
    );
  }

  /**
   * GET /doctor/schedule/stream
   * List all stream schedules for this doctor.
   */
  async findAllStreamSchedules(userId: string): Promise<StreamSchedule[]> {
    const profile = await this.getDoctorProfile(userId);
    return this.streamScheduleRepo.find({
      where: { doctorId: profile.id },
      order: { date: 'ASC', startTime: 'ASC' },
      relations: ['slots'],
    });
  }

  /**
   * GET /doctor/schedule/stream/:id/slots
   * View all slots for a specific stream schedule.
   */
  async getStreamSlots(userId: string, scheduleId: string): Promise<StreamSlot[]> {
    const profile = await this.getDoctorProfile(userId);
    const schedule = await this.streamScheduleRepo.findOne({
      where: { id: scheduleId, doctorId: profile.id },
    });
    if (!schedule) {
      throw new NotFoundException(`Stream schedule ${scheduleId} not found.`);
    }
    return this.streamSlotRepo.find({
      where: { scheduleId },
      order: { slotStart: 'ASC' },
    });
  }

  // ─── Wave Scheduling ──────────────────────────────────────────────────────

  /**
   * POST /doctor/schedule/wave
   * Create a wave schedule.
   */
  async createWaveSchedule(
    userId: string,
    dto: CreateWaveScheduleDto,
  ): Promise<WaveSchedule> {
    const { date, startTime, endTime, maxPatients } = dto;
    const profile = await this.getDoctorProfile(userId);

    if (toMinutes(startTime) >= toMinutes(endTime)) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}).`,
      );
    }

    const wave = this.waveScheduleRepo.create({
      doctorId: profile.id,
      date,
      startTime,
      endTime,
      maxPatients,
      currentCount: 0,
    });

    return this.waveScheduleRepo.save(wave);
  }

  /**
   * GET /doctor/schedule/wave
   * List all wave schedules for this doctor.
   */
  async findAllWaveSchedules(userId: string): Promise<WaveSchedule[]> {
    const profile = await this.getDoctorProfile(userId);
    return this.waveScheduleRepo.find({
      where: { doctorId: profile.id },
      order: { date: 'ASC', startTime: 'ASC' },
      relations: ['bookings'],
    });
  }
}
