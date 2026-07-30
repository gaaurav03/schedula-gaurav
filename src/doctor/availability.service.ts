import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringAvailability, DayOfWeek } from './entities/recurring-availability.entity';
import { CustomAvailability } from './entities/custom-availability.entity';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';

/** Convert "HH:mm" string to total minutes for easy comparison */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Map JS getDay() (0=Sun) to DayOfWeek enum */
const DAY_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(RecurringAvailability)
    private readonly recurringRepo: Repository<RecurringAvailability>,

    @InjectRepository(CustomAvailability)
    private readonly customRepo: Repository<CustomAvailability>,

    @InjectRepository(DoctorProfile)
    private readonly doctorProfileRepo: Repository<DoctorProfile>,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Resolve userId → DoctorProfile, throwing 404 if profile doesn't exist yet */
  private async getDoctorProfile(userId: string): Promise<DoctorProfile> {
    const profile = await this.doctorProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(
        'Doctor profile not found. Complete onboarding first via POST /doctor/profile.',
      );
    }
    return profile;
  }

  /** Validate startTime < endTime */
  private validateTimeRange(startTime: string, endTime: string): void {
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}).`,
      );
    }
  }

  /** Check for overlapping recurring slots for the same doctor + day (excluding a slot id) */
  private async checkRecurringOverlap(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.recurringRepo.find({
      where: { doctorId, dayOfWeek },
    });

    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);

    for (const slot of existing) {
      if (excludeId && slot.id === excludeId) continue;
      const existStart = toMinutes(slot.startTime);
      const existEnd = toMinutes(slot.endTime);
      // Standard interval overlap: newStart < existEnd && newEnd > existStart
      if (newStart < existEnd && newEnd > existStart) {
        throw new ConflictException(
          `Time slot ${startTime}–${endTime} overlaps with existing slot ${slot.startTime}–${slot.endTime} on ${dayOfWeek}.`,
        );
      }
    }
  }

  /** Check for overlapping custom slots for the same doctor + date (excluding a slot id) */
  private async checkCustomOverlap(
    doctorId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.customRepo.find({ where: { doctorId, date } });

    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);

    for (const slot of existing) {
      if (excludeId && slot.id === excludeId) continue;
      const existStart = toMinutes(slot.startTime);
      const existEnd = toMinutes(slot.endTime);
      if (newStart < existEnd && newEnd > existStart) {
        throw new ConflictException(
          `Time slot ${startTime}–${endTime} overlaps with existing override slot ${slot.startTime}–${slot.endTime} on ${date}.`,
        );
      }
    }
  }

  // ─── Recurring Availability ───────────────────────────────────────────────

  /**
   * POST /doctor/availability
   * Create a new recurring weekly slot.
   */
  async createRecurring(
    userId: string,
    dto: CreateRecurringAvailabilityDto,
  ): Promise<RecurringAvailability> {
    const {
      dayOfWeek,
      startTime,
      endTime,
      schedulingMode,
      maxPatients,
      slotDurationMins,
      bufferTimeMins,
    } = dto;
    const profile = await this.getDoctorProfile(userId);

    this.validateTimeRange(startTime, endTime);
    await this.checkRecurringOverlap(profile.id, dayOfWeek, startTime, endTime);

    const slot = this.recurringRepo.create({
      doctorId: profile.id,
      dayOfWeek,
      startTime,
      endTime,
      schedulingMode,
      maxPatients: maxPatients ?? null,
      slotDurationMins: slotDurationMins ?? null,
      bufferTimeMins: bufferTimeMins ?? 0,
    });

    return this.recurringRepo.save(slot);
  }

  /**
   * GET /doctor/availability
   * Get all recurring slots for this doctor.
   */
  async findAllRecurring(userId: string): Promise<RecurringAvailability[]> {
    const profile = await this.getDoctorProfile(userId);
    return this.recurringRepo.find({
      where: { doctorId: profile.id },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  /**
   * PATCH /doctor/availability/:id
   * Update a recurring slot — ownership check + overlap validation.
   */
  async updateRecurring(
    userId: string,
    slotId: string,
    dto: UpdateRecurringAvailabilityDto,
  ): Promise<RecurringAvailability> {
    const profile = await this.getDoctorProfile(userId);
    const slot = await this.recurringRepo.findOne({ where: { id: slotId } });

    if (!slot) throw new NotFoundException(`Recurring slot ${slotId} not found.`);
    if (slot.doctorId !== profile.id)
      throw new ForbiddenException('You do not own this availability slot.');

    const updatedDay = dto.dayOfWeek ?? slot.dayOfWeek;
    const updatedStart = dto.startTime ?? slot.startTime;
    const updatedEnd = dto.endTime ?? slot.endTime;

    this.validateTimeRange(updatedStart, updatedEnd);
    await this.checkRecurringOverlap(
      profile.id,
      updatedDay,
      updatedStart,
      updatedEnd,
      slotId,
    );

    Object.assign(slot, dto);
    return this.recurringRepo.save(slot);
  }

  /**
   * DELETE /doctor/availability/:id
   * Delete a recurring slot — ownership check.
   */
  async deleteRecurring(userId: string, slotId: string): Promise<{ message: string }> {
    const profile = await this.getDoctorProfile(userId);
    const slot = await this.recurringRepo.findOne({ where: { id: slotId } });

    if (!slot) throw new NotFoundException(`Recurring slot ${slotId} not found.`);
    if (slot.doctorId !== profile.id)
      throw new ForbiddenException('You do not own this availability slot.');

    await this.recurringRepo.remove(slot);
    return { message: 'Recurring availability slot deleted successfully.' };
  }

  // ─── Custom Date Override ─────────────────────────────────────────────────

  /**
   * POST /doctor/availability/override
   * Create a custom date override slot.
   */
  async createOverride(
    userId: string,
    dto: CreateCustomAvailabilityDto,
  ): Promise<CustomAvailability> {
    const {
      date,
      startTime,
      endTime,
      isAvailable = true,
      schedulingMode,
      maxPatients,
      slotDurationMins,
      bufferTimeMins,
    } = dto;
    const profile = await this.getDoctorProfile(userId);

    this.validateTimeRange(startTime, endTime);
    await this.checkCustomOverlap(profile.id, date, startTime, endTime);

    const slot = this.customRepo.create({
      doctorId: profile.id,
      date,
      startTime,
      endTime,
      isAvailable,
      schedulingMode: schedulingMode ?? null,
      maxPatients: maxPatients ?? null,
      slotDurationMins: slotDurationMins ?? null,
      bufferTimeMins: bufferTimeMins ?? 0,
    });

    return this.customRepo.save(slot);
  }

  /**
   * GET /doctor/availability/date?date=YYYY-MM-DD
   * Returns effective availability for a specific date:
   *   1. If custom overrides exist for that date → return them
   *   2. Otherwise → return recurring slots for that weekday
   */
  async getAvailabilityForDate(
    userId: string,
    dateStr: string,
  ): Promise<{
    type: 'custom' | 'recurring';
    date: string;
    dayOfWeek: string;
    slots: (CustomAvailability | RecurringAvailability)[];
  }> {
    // Validate date format
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
      throw new BadRequestException(
        'Invalid date format. Use YYYY-MM-DD (e.g. "2026-06-15").',
      );
    }

    const profile = await this.getDoctorProfile(userId);

    // Check for custom overrides on this date
    const customSlots = await this.customRepo.find({
      where: { doctorId: profile.id, date: dateStr },
      order: { startTime: 'ASC' },
    });

    if (customSlots.length > 0) {
      const dayOfWeek = DAY_MAP[new Date(dateStr).getDay()];
      return { type: 'custom', date: dateStr, dayOfWeek, slots: customSlots };
    }

    // Fall back to recurring for that weekday
    const dayOfWeek = DAY_MAP[new Date(dateStr).getDay()];
    const recurringSlots = await this.recurringRepo.find({
      where: { doctorId: profile.id, dayOfWeek },
      order: { startTime: 'ASC' },
    });

    return { type: 'recurring', date: dateStr, dayOfWeek, slots: recurringSlots };
  }
}
