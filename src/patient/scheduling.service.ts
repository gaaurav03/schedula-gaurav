import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StreamSlot } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveBooking } from '../doctor/entities/wave-booking.entity';
import { PatientProfile } from './entities/patient-profile.entity';

@Injectable()
export class PatientSchedulingService {
  constructor(
    @InjectRepository(StreamSlot)
    private readonly streamSlotRepo: Repository<StreamSlot>,

    @InjectRepository(WaveSchedule)
    private readonly waveScheduleRepo: Repository<WaveSchedule>,

    @InjectRepository(WaveBooking)
    private readonly waveBookingRepo: Repository<WaveBooking>,

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

  // ─── Stream: Patient View ─────────────────────────────────────────────────

  /**
   * GET /patient/schedule/stream?doctorId=&date=
   * View all available (unbooked) stream slots for a doctor on a date.
   */
  async getAvailableStreamSlots(
    doctorId: string,
    date: string,
  ): Promise<{
    type: 'STREAM';
    doctorId: string;
    date: string;
    availableSlots: StreamSlot[];
  }> {
    const slots = await this.streamSlotRepo.find({
      where: { doctorId, date, isBooked: false },
      order: { slotStart: 'ASC' },
    });

    return {
      type: 'STREAM',
      doctorId,
      date,
      availableSlots: slots,
    };
  }

  /**
   * POST /patient/schedule/stream/:slotId/book
   * Book a specific stream slot → returns exact appointment time.
   */
  async bookStreamSlot(
    userId: string,
    slotId: string,
  ): Promise<{
    message: string;
    appointmentType: 'STREAM';
    appointmentTime: string;
    date: string;
  }> {
    const patient = await this.getPatientProfile(userId);

    const slot = await this.streamSlotRepo.findOne({ where: { id: slotId } });
    if (!slot) {
      throw new NotFoundException(`Stream slot ${slotId} not found.`);
    }

    if (slot.isBooked) {
      throw new ConflictException(
        'This slot is already booked. Please choose another available slot.',
      );
    }

    // Check if this patient already booked a slot in the same schedule
    const alreadyBooked = await this.streamSlotRepo.findOne({
      where: { scheduleId: slot.scheduleId, patientId: patient.id },
    });
    if (alreadyBooked) {
      throw new ConflictException(
        `You already have a booking in this schedule: ${alreadyBooked.slotStart}–${alreadyBooked.slotEnd}.`,
      );
    }

    // Mark slot as booked
    slot.isBooked = true;
    slot.patientId = patient.id;
    slot.bookedAt = new Date();
    await this.streamSlotRepo.save(slot);

    return {
      message: 'Appointment booked successfully!',
      appointmentType: 'STREAM',
      appointmentTime: `${slot.slotStart} – ${slot.slotEnd}`,
      date: slot.date,
    };
  }

  // ─── Wave: Patient View ───────────────────────────────────────────────────

  /**
   * GET /patient/schedule/wave?doctorId=&date=
   * View wave schedules for a doctor on a specific date.
   */
  async getWaveSchedules(
    doctorId: string,
    date: string,
  ): Promise<{
    type: 'WAVE';
    doctorId: string;
    date: string;
    waves: {
      id: string;
      timeWindow: string;
      available: string;
      isFull: boolean;
    }[];
  }> {
    const waves = await this.waveScheduleRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });

    return {
      type: 'WAVE',
      doctorId,
      date,
      waves: waves.map((w) => ({
        id: w.id,
        timeWindow: `${w.startTime} – ${w.endTime}`,
        available: `${w.maxPatients - w.currentCount}/${w.maxPatients}`,
        isFull: w.currentCount >= w.maxPatients,
      })),
    };
  }

  /**
   * POST /patient/schedule/wave/:waveId/book
   * Book into a wave → assigned token number in order of booking.
   */
  async bookWaveSlot(
    userId: string,
    waveId: string,
  ): Promise<{
    message: string;
    appointmentType: 'WAVE';
    timeWindow: string;
    date: string;
    tokenNumber: number;
    availability: string;
  }> {
    const patient = await this.getPatientProfile(userId);

    const wave = await this.waveScheduleRepo.findOne({ where: { id: waveId } });
    if (!wave) {
      throw new NotFoundException(`Wave schedule ${waveId} not found.`);
    }

    // Check capacity
    if (wave.currentCount >= wave.maxPatients) {
      throw new ConflictException(
        `Wave is full (${wave.maxPatients}/${wave.maxPatients}). No more bookings accepted.`,
      );
    }

    // Check duplicate booking
    const existingBooking = await this.waveBookingRepo.findOne({
      where: { waveId, patientId: patient.id },
    });
    if (existingBooking) {
      throw new ConflictException(
        `You have already booked this wave. Your token number is ${existingBooking.tokenNumber}.`,
      );
    }

    // Assign token number (next in sequence)
    const tokenNumber = wave.currentCount + 1;

    // Save booking
    const booking = this.waveBookingRepo.create({
      waveId,
      patientId: patient.id,
      tokenNumber,
      bookedAt: new Date(),
    });
    await this.waveBookingRepo.save(booking);

    // Increment wave counter
    wave.currentCount += 1;
    await this.waveScheduleRepo.save(wave);

    return {
      message: 'Wave booking confirmed!',
      appointmentType: 'WAVE',
      timeWindow: `${wave.startTime} – ${wave.endTime}`,
      date: wave.date,
      tokenNumber,
      availability: `${wave.maxPatients - wave.currentCount}/${wave.maxPatients} remaining`,
    };
  }
}
