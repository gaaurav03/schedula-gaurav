import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamSchedule } from '../doctor/entities/stream-schedule.entity';
import { StreamBooking } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveSlot } from '../doctor/entities/wave-booking.entity';
import { PatientProfile } from './entities/patient-profile.entity';

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

  // ─── STREAM: Token-Based Patient Booking ─────────────────────────────────

  /**
   * GET /patient/schedule/stream?doctorId=&date=
   * View STREAM sessions for a doctor on a date.
   * Shows capacity and whether this is a RECURRING or CUSTOM schedule.
   */
  async getStreamSchedules(
    doctorId: string,
    date: string,
  ) {
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
   * Response includes schedulingType (RECURRING or CUSTOM).
   */
  async bookStream(userId: string, streamId: string) {
    const patient = await this.getPatientProfile(userId);

    const stream = await this.streamScheduleRepo.findOne({ where: { id: streamId } });
    if (!stream) {
      throw new NotFoundException(`Stream session ${streamId} not found.`);
    }

    // Check capacity
    if (stream.currentCount >= stream.maxPatients) {
      throw new ConflictException(
        `Stream session is full (${stream.maxPatients}/${stream.maxPatients} tokens issued). No more bookings.`,
      );
    }

    // Check duplicate booking
    const existing = await this.streamBookingRepo.findOne({
      where: { streamId, patientId: patient.id },
    });
    if (existing) {
      throw new ConflictException(
        `You have already booked this session. Your token number is #${existing.tokenNumber}.`,
      );
    }

    // Assign next token number
    const tokenNumber = stream.currentCount + 1;

    const booking = this.streamBookingRepo.create({
      streamId,
      patientId: patient.id,
      tokenNumber,
      bookedAt: new Date(),
    });
    await this.streamBookingRepo.save(booking);

    // Increment counter
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
   * Each slot shows its schedulingType (RECURRING or CUSTOM).
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
   * Response includes schedulingType (RECURRING or CUSTOM).
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

    // Check if patient already booked another slot in the same wave schedule
    const alreadyBooked = await this.waveSlotRepo.findOne({
      where: { waveId: slot.waveId, patientId: patient.id },
    });
    if (alreadyBooked) {
      throw new ConflictException(
        `You already have a booking in this schedule at ${alreadyBooked.slotStart}–${alreadyBooked.slotEnd}.`,
      );
    }

    // Mark slot as booked
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
