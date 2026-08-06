import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, MoreThan, MoreThanOrEqual } from 'typeorm';
import { RecurringAvailability, DayOfWeek, SchedulingMode } from './entities/recurring-availability.entity';
import { CustomAvailability } from './entities/custom-availability.entity';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { WaveSchedule } from './entities/wave-schedule.entity';
import { WaveSlot } from './entities/wave-booking.entity';
import { StreamSchedule } from './entities/stream-schedule.entity';
import { StreamBooking } from './entities/stream-slot.entity';
import { Appointment, AppointmentStatus } from '../appointment/entities/appointment.entity';
import { PatientProfile } from '../patient/entities/patient-profile.entity';
import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert "HH:mm" string to total minutes for easy comparison */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes back to "HH:mm" */
function fromMinutes(mins: number): string {
  return `${Math.floor(mins / 60).toString().padStart(2, '0')}:${(mins % 60).toString().padStart(2, '0')}`;
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

/** Build wave slot objects for a given window */
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
      waveId, doctorId, date,
      slotStart: fromMinutes(current),
      slotEnd: fromMinutes(current + slotDurationMins),
      isBooked: false, patientId: null, bookedAt: null,
    });
    current += slotDurationMins + bufferTimeMins;
  }
  return slots;
}

/** Get today's date string in YYYY-MM-DD (local) */
function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Tier Labels ─────────────────────────────────────────────────────────────

type ReassignmentTier = 'SAME_WINDOW' | 'SAME_DAY_OTHER_SESSION' | 'NEXT_AVAILABLE_DATE';

interface ReplacementResult {
  slot: WaveSlot;
  tier: ReassignmentTier;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(RecurringAvailability)
    private readonly recurringRepo: Repository<RecurringAvailability>,

    @InjectRepository(CustomAvailability)
    private readonly customRepo: Repository<CustomAvailability>,

    @InjectRepository(DoctorProfile)
    private readonly doctorProfileRepo: Repository<DoctorProfile>,

    @InjectRepository(WaveSchedule)
    private readonly waveScheduleRepo: Repository<WaveSchedule>,

    @InjectRepository(WaveSlot)
    private readonly waveSlotRepo: Repository<WaveSlot>,

    @InjectRepository(StreamSchedule)
    private readonly streamScheduleRepo: Repository<StreamSchedule>,

    @InjectRepository(StreamBooking)
    private readonly streamBookingRepo: Repository<StreamBooking>,

    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(PatientProfile)
    private readonly patientProfileRepo: Repository<PatientProfile>,

    private readonly dataSource: DataSource,
  ) {}

  // ─── Core Helpers ──────────────────────────────────────────────────────────

  private async getDoctorProfile(userId: string): Promise<DoctorProfile> {
    const profile = await this.doctorProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(
        'Doctor profile not found. Complete onboarding first via POST /doctor/profile.',
      );
    }
    return profile;
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    if (toMinutes(startTime) >= toMinutes(endTime)) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime}).`,
      );
    }
  }

  private async checkRecurringOverlap(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.recurringRepo.find({ where: { doctorId, dayOfWeek } });
    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);
    for (const slot of existing) {
      if (excludeId && slot.id === excludeId) continue;
      const existStart = toMinutes(slot.startTime);
      const existEnd = toMinutes(slot.endTime);
      if (newStart < existEnd && newEnd > existStart) {
        throw new ConflictException(
          `Time slot ${startTime}–${endTime} overlaps with existing slot ${slot.startTime}–${slot.endTime} on ${dayOfWeek}.`,
        );
      }
    }
  }

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

  // ─── Elastic Scheduling Helpers ───────────────────────────────────────────

  /**
   * 3-tier cascading replacement slot finder for WAVE mode.
   *
   * Tier 1: Free slot within the new smaller window (same wave session, same date).
   * Tier 2: Free slot in any other wave session on the same date for this doctor.
   * Tier 3: Earliest free wave slot on any future date for this doctor.
   *
   * Returns { slot, tier } or null if all tiers exhausted.
   */
  private async findWaveReplacementSlot(
    doctorId: string,
    preferredDate: string,
    newWindowStart: string,
    newWindowEnd: string,
    excludeWaveId: string,
  ): Promise<ReplacementResult | null> {
    const newStartMins = toMinutes(newWindowStart);
    const newEndMins = toMinutes(newWindowEnd);
    const today = todayStr();

    // ── Tier 1: free slot inside the new window (same wave, same date) ──────
    const tier1Slots = await this.waveSlotRepo.find({
      where: { waveId: excludeWaveId, isBooked: false },
      order: { slotStart: 'ASC' },
    });
    const tier1 = tier1Slots.find(
      (s) => toMinutes(s.slotStart) >= newStartMins && toMinutes(s.slotEnd) <= newEndMins,
    );
    if (tier1) return { slot: tier1, tier: 'SAME_WINDOW' };

    // ── Tier 2: any other wave session on the same date ───────────────────
    const sameDayWaves = await this.waveScheduleRepo.find({
      where: { doctorId, date: preferredDate },
    });
    for (const wave of sameDayWaves) {
      if (wave.id === excludeWaveId) continue;
      const freeSlot = await this.waveSlotRepo.findOne({
        where: { waveId: wave.id, isBooked: false },
        order: { slotStart: 'ASC' },
      });
      if (freeSlot) return { slot: freeSlot, tier: 'SAME_DAY_OTHER_SESSION' };
    }

    // ── Tier 3: nearest future date with any free wave slot ───────────────
    const futureSlot = await this.waveSlotRepo.findOne({
      where: { doctorId, isBooked: false, date: MoreThanOrEqual(today) },
      order: { date: 'ASC', slotStart: 'ASC' },
    });
    if (futureSlot) return { slot: futureSlot, tier: 'NEXT_AVAILABLE_DATE' };

    return null;
  }

  /**
   * 3-tier cascading replacement finder for STREAM mode (displaced tokens).
   *
   * Tier 1 (skipped for stream — no "same window" concept for tokens).
   * Tier 2: Same day another STREAM session with remaining capacity.
   * Tier 3: Nearest future STREAM session with remaining capacity.
   *
   * Returns the target stream session or null.
   */
  private async findStreamReplacementSession(
    doctorId: string,
    preferredDate: string,
    excludeStreamId: string,
  ): Promise<{ session: StreamSchedule; tier: ReassignmentTier } | null> {
    const today = todayStr();

    // ── Tier 2: Same day other stream session ─────────────────────────────
    const sameDaySessions = await this.streamScheduleRepo.find({
      where: { doctorId, date: preferredDate },
      order: { startTime: 'ASC' },
    });
    for (const s of sameDaySessions) {
      if (s.id === excludeStreamId) continue;
      if (s.currentCount < s.maxPatients) return { session: s, tier: 'SAME_DAY_OTHER_SESSION' };
    }

    // ── Tier 3: Nearest future stream session with capacity ───────────────
    const futureSessions = await this.streamScheduleRepo.find({
      where: { doctorId, date: MoreThanOrEqual(today) },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    const futureSession = futureSessions.find((s) => s.currentCount < s.maxPatients);
    if (futureSession) return { session: futureSession, tier: 'NEXT_AVAILABLE_DATE' };

    return null;
  }

  // ─── Recurring Availability CRUD ─────────────────────────────────────────

  async createRecurring(
    userId: string,
    dto: CreateRecurringAvailabilityDto,
  ): Promise<RecurringAvailability> {
    const { dayOfWeek, startTime, endTime, schedulingMode, maxPatients, slotDurationMins, bufferTimeMins } = dto;
    const profile = await this.getDoctorProfile(userId);
    this.validateTimeRange(startTime, endTime);
    await this.checkRecurringOverlap(profile.id, dayOfWeek, startTime, endTime);
    const slot = this.recurringRepo.create({
      doctorId: profile.id, dayOfWeek, startTime, endTime, schedulingMode,
      maxPatients: maxPatients ?? null,
      slotDurationMins: slotDurationMins ?? null,
      bufferTimeMins: bufferTimeMins ?? 0,
    });
    return this.recurringRepo.save(slot);
  }

  async findAllRecurring(userId: string): Promise<RecurringAvailability[]> {
    const profile = await this.getDoctorProfile(userId);
    return this.recurringRepo.find({
      where: { doctorId: profile.id },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  // ─── ELASTIC SCHEDULING: updateRecurring ─────────────────────────────────

  /**
   * PATCH /doctor/availability/:id
   *
   * Elastic-aware update of a recurring availability template.
   * Automatically expands or shrinks all future materialized sessions
   * (wave_schedules / stream_schedules) generated from this template.
   *
   * WAVE EXPAND:  Generates new slots for the newly added time range.
   * WAVE SHRINK:  Runs 3-tier cascading reassignment for displaced booked slots.
   * STREAM EXPAND: Updates session window + optionally bumps maxPatients.
   * STREAM SHRINK: If new maxPatients < currentCount, cascades displaced tokens
   *                to other sessions. Blocks with 409 if no capacity anywhere.
   */
  async updateRecurring(
    userId: string,
    slotId: string,
    dto: UpdateRecurringAvailabilityDto,
  ): Promise<object> {
    const profile = await this.getDoctorProfile(userId);
    const recurringSlot = await this.recurringRepo.findOne({ where: { id: slotId } });
    if (!recurringSlot) throw new NotFoundException(`Recurring slot ${slotId} not found.`);
    if (recurringSlot.doctorId !== profile.id)
      throw new ForbiddenException('You do not own this availability slot.');

    const updatedDay   = dto.dayOfWeek      ?? recurringSlot.dayOfWeek;
    const newStart     = dto.startTime      ?? recurringSlot.startTime;
    const newEnd       = dto.endTime        ?? recurringSlot.endTime;
    const oldStart     = recurringSlot.startTime;
    const oldEnd       = recurringSlot.endTime;

    this.validateTimeRange(newStart, newEnd);
    await this.checkRecurringOverlap(profile.id, updatedDay, newStart, newEnd, slotId);

    const isExpand = toMinutes(newStart) < toMinutes(oldStart) || toMinutes(newEnd) > toMinutes(oldEnd);
    const isShrink = toMinutes(newStart) > toMinutes(oldStart) || toMinutes(newEnd) < toMinutes(oldEnd);
    const isWindowChange = isExpand || isShrink;

    // ── No window change: just update template fields (mode, capacity, etc.) ─
    if (!isWindowChange) {
      Object.assign(recurringSlot, dto);
      const saved = await this.recurringRepo.save(recurringSlot);
      return { message: 'Recurring availability updated.', action: 'UPDATED', slot: saved };
    }

    const today = todayStr();
    const mode = recurringSlot.schedulingMode;

    // ─────────────────────────────────────────────────────────────────────────
    // WAVE MODE
    // ─────────────────────────────────────────────────────────────────────────
    if (mode === SchedulingMode.WAVE) {
      const futurWaveSchedules = await this.waveScheduleRepo.find({
        where: { recurringAvailabilityId: slotId, date: MoreThanOrEqual(today) },
        order: { date: 'ASC' },
      });

      if (isExpand) {
        // ─ WAVE EXPAND ───────────────────────────────────────────────────────
        let totalNewSlots = 0;
        await this.dataSource.transaction(async (em) => {
          for (const ws of futurWaveSchedules) {
            const slotDuration = dto.slotDurationMins ?? recurringSlot.slotDurationMins ?? 15;
            const bufferTime = dto.bufferTimeMins ?? recurringSlot.bufferTimeMins ?? 0;

            // Generate slots only for the newly added time range(s)
            const newSlotsLeft: Partial<WaveSlot>[] = [];
            const newSlotsRight: Partial<WaveSlot>[] = [];

            if (toMinutes(newStart) < toMinutes(oldStart)) {
              newSlotsLeft.push(...buildWaveSlots(ws.id, profile.id, ws.date, newStart, oldStart, slotDuration, bufferTime));
            }
            if (toMinutes(newEnd) > toMinutes(oldEnd)) {
              newSlotsRight.push(...buildWaveSlots(ws.id, profile.id, ws.date, oldEnd, newEnd, slotDuration, bufferTime));
            }

            const newSlots = [...newSlotsLeft, ...newSlotsRight];
            if (newSlots.length > 0) {
              await em.save(WaveSlot, newSlots);
              totalNewSlots += newSlots.length;
            }

            await em.update(WaveSchedule, ws.id, { startTime: newStart, endTime: newEnd });
          }
          Object.assign(recurringSlot, dto, { startTime: newStart, endTime: newEnd });
          await em.save(RecurringAvailability, recurringSlot);
        });

        return {
          message: `Availability expanded. ${totalNewSlots} new slot(s) generated across ${futurWaveSchedules.length} future session(s).`,
          action: 'EXPANDED',
          oldWindow: `${oldStart} – ${oldEnd}`,
          newWindow: `${newStart} – ${newEnd}`,
          sessionsUpdated: futurWaveSchedules.length,
          newSlotsGenerated: totalNewSlots,
        };

      } else {
        // ─ WAVE SHRINK ───────────────────────────────────────────────────────
        const newStartMins = toMinutes(newStart);
        const newEndMins = toMinutes(newEnd);

        // Collect all booked slots across future sessions that fall outside new window
        const displacedSlots: WaveSlot[] = [];
        for (const ws of futurWaveSchedules) {
          const bookedSlots = await this.waveSlotRepo.find({
            where: { waveId: ws.id, isBooked: true },
          });
          const outside = bookedSlots.filter(
            (s) => toMinutes(s.slotStart) < newStartMins || toMinutes(s.slotEnd) > newEndMins,
          );
          displacedSlots.push(...outside);
        }

        // For each displaced slot: try 3-tier cascading reassignment
        const reassignments: object[] = [];
        const unresolvable: object[] = [];

        for (const displacedSlot of displacedSlots) {
          const replacement = await this.findWaveReplacementSlot(
            profile.id,
            displacedSlot.date,
            newStart,
            newEnd,
            displacedSlot.waveId,
          );

          if (!replacement) {
            // Fetch patient name for error response
            const patient = await this.patientProfileRepo.findOne({ where: { id: displacedSlot.patientId! } });
            unresolvable.push({
              appointmentId: displacedSlot.id,
              patientName: patient?.fullName ?? 'Unknown',
              date: displacedSlot.date,
              currentSlotTime: `${displacedSlot.slotStart} - ${displacedSlot.slotEnd}`,
            });
          } else {
            const patient = await this.patientProfileRepo.findOne({ where: { id: displacedSlot.patientId! } });
            reassignments.push({
              displacedTime: `${displacedSlot.slotStart} - ${displacedSlot.slotEnd}`,
              patientName: patient?.fullName ?? 'Unknown',
              reassignedTo: {
                date: replacement.slot.date,
                time: `${replacement.slot.slotStart} - ${replacement.slot.slotEnd}`,
                tier: replacement.tier,
              },
            });
          }
        }

        // If any are unresolvable → rollback (don't even start the transaction)
        if (unresolvable.length > 0) {
          throw new ConflictException({
            message: `Cannot shrink: ${unresolvable.length} booked appointment(s) fall outside the new window and no free wave slot exists anywhere in this doctor's future schedule.`,
            affectedAppointments: unresolvable,
          });
        }

        // All displacements can be resolved → execute atomically
        await this.dataSource.transaction(async (em) => {
          // 1. Reassign each displaced slot
          for (let i = 0; i < displacedSlots.length; i++) {
            const displaced = displacedSlots[i];
            const replacementRes = await this.findWaveReplacementSlot(
              profile.id, displaced.date, newStart, newEnd, displaced.waveId,
            );
            if (!replacementRes) throw new Error('Replacement slot disappeared during transaction — rolling back.');

            const { slot: newSlot } = replacementRes;

            // Mark new slot as booked by this patient
            await em.update(WaveSlot, newSlot.id, {
              isBooked: true,
              patientId: displaced.patientId,
              bookedAt: new Date(),
            });

            // Release the displaced slot
            await em.update(WaveSlot, displaced.id, {
              isBooked: false, patientId: null, bookedAt: null,
            });

            // Update the unified Appointment record
            await em.update(
              Appointment,
              { waveSlotId: displaced.id, status: AppointmentStatus.BOOKED },
              {
                waveSlotId: newSlot.id,
                date: newSlot.date,
                startTime: newSlot.slotStart,
                endTime: newSlot.slotEnd,
                rescheduledAt: new Date(),
                rescheduleReason: 'Auto-reassigned due to doctor availability shrink',
              },
            );
          }

          // 2. Delete unbooked slots that fall outside the new window
          for (const ws of futurWaveSchedules) {
            const unbookedOutside = await em.find(WaveSlot, {
              where: { waveId: ws.id, isBooked: false },
            });
            const toDelete = unbookedOutside.filter(
              (s) => toMinutes(s.slotStart) < newStartMins || toMinutes(s.slotEnd) > newEndMins,
            );
            if (toDelete.length > 0) await em.remove(WaveSlot, toDelete);

            // 3. Update wave schedule window
            await em.update(WaveSchedule, ws.id, { startTime: newStart, endTime: newEnd });
          }

          // 4. Update the recurring template
          Object.assign(recurringSlot, dto, { startTime: newStart, endTime: newEnd });
          await em.save(RecurringAvailability, recurringSlot);
        });

        const tierSummary = reassignments.length > 0
          ? `${reassignments.length} appointment(s) auto-reassigned.`
          : 'No appointments were affected.';

        return {
          message: `Availability shrunk. ${tierSummary}`,
          action: 'SHRUNK',
          oldWindow: `${oldStart} – ${oldEnd}`,
          newWindow: `${newStart} – ${newEnd}`,
          sessionsUpdated: futurWaveSchedules.length,
          reassignments,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STREAM MODE
    // ─────────────────────────────────────────────────────────────────────────
    const futureStreamSchedules = await this.streamScheduleRepo.find({
      where: { recurringAvailabilityId: slotId, date: MoreThanOrEqual(today) },
      order: { date: 'ASC' },
    });

    const newMaxPatients = dto.maxPatients ?? recurringSlot.maxPatients;

    if (isExpand) {
      // ─ STREAM EXPAND ─────────────────────────────────────────────────────
      await this.dataSource.transaction(async (em) => {
        for (const ss of futureStreamSchedules) {
          const updateData: Partial<StreamSchedule> = { startTime: newStart, endTime: newEnd };
          if (newMaxPatients && newMaxPatients > ss.maxPatients) {
            updateData.maxPatients = newMaxPatients;
          }
          await em.update(StreamSchedule, ss.id, updateData);
        }
        Object.assign(recurringSlot, dto, { startTime: newStart, endTime: newEnd });
        await em.save(RecurringAvailability, recurringSlot);
      });

      return {
        message: `Stream availability expanded across ${futureStreamSchedules.length} future session(s).`,
        action: 'EXPANDED',
        oldWindow: `${oldStart} – ${oldEnd}`,
        newWindow: `${newStart} – ${newEnd}`,
        sessionsUpdated: futureStreamSchedules.length,
      };

    } else {
      // ─ STREAM SHRINK ─────────────────────────────────────────────────────
      const reassignments: object[] = [];
      const unresolvable: object[] = [];

      if (newMaxPatients !== null && newMaxPatients !== undefined) {
        for (const ss of futureStreamSchedules) {
          if (ss.currentCount <= newMaxPatients) continue; // No displacement

          // Find displaced token holders (tokens > newMaxPatients)
          const displacedBookings = await this.streamBookingRepo.find({
            where: { streamId: ss.id },
            order: { tokenNumber: 'ASC' },
          });
          const displaced = displacedBookings.filter((b) => b.tokenNumber > newMaxPatients);

          for (const booking of displaced) {
            const replacement = await this.findStreamReplacementSession(
              profile.id, ss.date, ss.id,
            );
            const patient = await this.patientProfileRepo.findOne({ where: { id: booking.patientId } });

            if (!replacement) {
              unresolvable.push({
                tokenNumber: booking.tokenNumber,
                patientName: patient?.fullName ?? 'Unknown',
                date: ss.date,
                sessionWindow: `${ss.startTime} - ${ss.endTime}`,
              });
            } else {
              reassignments.push({
                patientName: patient?.fullName ?? 'Unknown',
                oldToken: booking.tokenNumber,
                oldSession: `${ss.date} ${ss.startTime} - ${ss.endTime}`,
                reassignedTo: {
                  date: replacement.session.date,
                  sessionWindow: `${replacement.session.startTime} - ${replacement.session.endTime}`,
                  tier: replacement.tier,
                },
              });
            }
          }
        }
      }

      if (unresolvable.length > 0) {
        throw new ConflictException({
          message: `Cannot shrink stream capacity: ${unresolvable.length} booked token(s) cannot be reassigned — no open stream session found anywhere in this doctor's future schedule.`,
          affectedBookings: unresolvable,
        });
      }

      // All resolvable → execute atomically
      await this.dataSource.transaction(async (em) => {
        for (const ss of futureStreamSchedules) {
          if (newMaxPatients !== null && newMaxPatients !== undefined && ss.currentCount > newMaxPatients) {
            const displacedBookings = await this.streamBookingRepo.find({
              where: { streamId: ss.id },
              order: { tokenNumber: 'ASC' },
            });
            const displaced = displacedBookings.filter((b) => b.tokenNumber > newMaxPatients);

            for (const booking of displaced) {
              const replacement = await this.findStreamReplacementSession(profile.id, ss.date, ss.id);
              if (!replacement) throw new Error('Replacement session disappeared during transaction — rolling back.');

              const newToken = replacement.session.currentCount + 1;

              // Move the stream booking to the new session
              await em.update(StreamBooking, booking.id, {
                streamId: replacement.session.id,
                tokenNumber: newToken,
              });
              await em.update(StreamSchedule, replacement.session.id, {
                currentCount: newToken,
              });
              await em.update(StreamSchedule, ss.id, { currentCount: ss.currentCount - 1 });

              // Update unified appointment record
              await em.update(
                Appointment,
                { streamBookingId: booking.id, status: AppointmentStatus.BOOKED },
                {
                  date: replacement.session.date,
                  startTime: replacement.session.startTime,
                  endTime: replacement.session.endTime,
                  tokenNumber: newToken,
                  rescheduledAt: new Date(),
                  rescheduleReason: 'Auto-reassigned due to stream capacity shrink',
                },
              );
            }
          }

          // Update stream window + maxPatients
          const updateData: Partial<StreamSchedule> = { startTime: newStart, endTime: newEnd };
          if (newMaxPatients !== null && newMaxPatients !== undefined) {
            updateData.maxPatients = newMaxPatients;
          }
          await em.update(StreamSchedule, ss.id, updateData);
        }

        Object.assign(recurringSlot, dto, { startTime: newStart, endTime: newEnd });
        await em.save(RecurringAvailability, recurringSlot);
      });

      return {
        message: `Stream availability shrunk. ${reassignments.length} token(s) reassigned.`,
        action: 'SHRUNK',
        oldWindow: `${oldStart} – ${oldEnd}`,
        newWindow: `${newStart} – ${newEnd}`,
        sessionsUpdated: futureStreamSchedules.length,
        reassignments,
      };
    }
  }

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
   *
   * Creates or expands a custom date override slot.
   * If a custom override already exists for this doctor + date:
   *  - Automatically EXPANDS/UPDATES the existing custom override
   *  - Generates new WaveSlots for the expanded window if a WaveSchedule exists for that date
   *  - Updates StreamSchedule window + maxPatients if a StreamSchedule exists for that date
   * If no custom override exists for this date:
   *  - Creates a new CustomAvailability record.
   */
  async createOverride(
    userId: string,
    dto: CreateCustomAvailabilityDto,
  ): Promise<any> {
    const {
      date, startTime, endTime,
      isAvailable = true, schedulingMode, maxPatients, slotDurationMins, bufferTimeMins,
    } = dto;
    const profile = await this.getDoctorProfile(userId);
    this.validateTimeRange(startTime, endTime);

    // Check if an existing custom override already exists for this date
    const existingCustomSlots = await this.customRepo.find({
      where: { doctorId: profile.id, date },
    });

    if (existingCustomSlots.length > 0) {
      // Upsert / Expand the primary custom override for this date
      const existing = existingCustomSlots[0];
      const oldStart = existing.startTime;
      const oldEnd = existing.endTime;

      const updatedStart = startTime;
      const updatedEnd = endTime;

      // Update the custom availability record
      existing.startTime = updatedStart;
      existing.endTime = updatedEnd;
      existing.isAvailable = isAvailable;
      if (schedulingMode) existing.schedulingMode = schedulingMode;
      if (maxPatients !== undefined) existing.maxPatients = maxPatients ?? null;
      if (slotDurationMins !== undefined) existing.slotDurationMins = slotDurationMins ?? null;
      if (bufferTimeMins !== undefined) existing.bufferTimeMins = bufferTimeMins ?? 0;

      await this.customRepo.save(existing);

      let newSlotsCount = 0;
      const mode = existing.schedulingMode;

      // If a WaveSchedule already exists for this date, expand its slots
      if (mode === SchedulingMode.WAVE) {
        const waveSchedule = await this.waveScheduleRepo.findOne({
          where: { doctorId: profile.id, date },
        });

        if (waveSchedule) {
          const duration = slotDurationMins ?? waveSchedule.slotDurationMins ?? 15;
          const buffer = bufferTimeMins ?? waveSchedule.bufferTimeMins ?? 0;

          const newSlotsLeft: Partial<WaveSlot>[] = [];
          const newSlotsRight: Partial<WaveSlot>[] = [];

          if (toMinutes(updatedStart) < toMinutes(oldStart)) {
            newSlotsLeft.push(...buildWaveSlots(waveSchedule.id, profile.id, date, updatedStart, oldStart, duration, buffer));
          }
          if (toMinutes(updatedEnd) > toMinutes(oldEnd)) {
            newSlotsRight.push(...buildWaveSlots(waveSchedule.id, profile.id, date, oldEnd, updatedEnd, duration, buffer));
          }

          const newSlots = [...newSlotsLeft, ...newSlotsRight];
          if (newSlots.length > 0) {
            await this.waveSlotRepo.save(newSlots);
            newSlotsCount = newSlots.length;
          }

          waveSchedule.startTime = updatedStart;
          waveSchedule.endTime = updatedEnd;
          await this.waveScheduleRepo.save(waveSchedule);
        }
      } else if (mode === SchedulingMode.STREAM) {
        const streamSchedule = await this.streamScheduleRepo.findOne({
          where: { doctorId: profile.id, date },
        });
        if (streamSchedule) {
          streamSchedule.startTime = updatedStart;
          streamSchedule.endTime = updatedEnd;
          if (maxPatients && maxPatients > streamSchedule.maxPatients) {
            streamSchedule.maxPatients = maxPatients;
          }
          await this.streamScheduleRepo.save(streamSchedule);
        }
      }

      return {
        message: `Custom date override for ${date} updated/expanded successfully!`,
        action: 'CUSTOM_EXPANDED',
        date,
        oldWindow: `${oldStart} - ${oldEnd}`,
        newWindow: `${updatedStart} - ${updatedEnd}`,
        newSlotsGenerated: newSlotsCount,
        override: existing,
      };
    }

    // No existing override for this date -> standard creation
    await this.checkCustomOverlap(profile.id, date, startTime, endTime);
    const slot = this.customRepo.create({
      doctorId: profile.id, date, startTime, endTime, isAvailable,
      schedulingMode: schedulingMode ?? null,
      maxPatients: maxPatients ?? null,
      slotDurationMins: slotDurationMins ?? null,
      bufferTimeMins: bufferTimeMins ?? 0,
    });
    const saved = await this.customRepo.save(slot);
    return {
      message: `Custom date override for ${date} created successfully!`,
      action: 'CUSTOM_CREATED',
      override: saved,
    };
  }

  /**
   * DELETE /doctor/availability/override/:id
   * Removes a custom date override.
   */
  async deleteOverride(userId: string, overrideId: string): Promise<{ message: string }> {
    const profile = await this.getDoctorProfile(userId);
    const slot = await this.customRepo.findOne({ where: { id: overrideId } });
    if (!slot) throw new NotFoundException(`Custom override ${overrideId} not found.`);
    if (slot.doctorId !== profile.id)
      throw new ForbiddenException('You do not own this availability override.');
    await this.customRepo.remove(slot);
    return { message: 'Custom date override deleted successfully.' };
  }


  async getAvailabilityForDate(
    userId: string,
    dateStr: string,
  ): Promise<{
    type: 'custom' | 'recurring';
    date: string;
    dayOfWeek: string;
    slots: (CustomAvailability | RecurringAvailability)[];
  }> {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD (e.g. "2026-06-15").');
    }
    const profile = await this.getDoctorProfile(userId);
    const customSlots = await this.customRepo.find({
      where: { doctorId: profile.id, date: dateStr },
      order: { startTime: 'ASC' },
    });
    if (customSlots.length > 0) {
      const dayOfWeek = DAY_MAP[new Date(dateStr).getDay()];
      return { type: 'custom', date: dateStr, dayOfWeek, slots: customSlots };
    }
    const dayOfWeek = DAY_MAP[new Date(dateStr).getDay()];
    const recurringSlots = await this.recurringRepo.find({
      where: { doctorId: profile.id, dayOfWeek },
      order: { startTime: 'ASC' },
    });
    return { type: 'recurring', date: dateStr, dayOfWeek, slots: recurringSlots };
  }
}
