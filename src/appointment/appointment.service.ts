import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Appointment, AppointmentStatus, AppointmentType } from './entities/appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { StreamSchedule, SchedulingType } from '../doctor/entities/stream-schedule.entity';
import { StreamBooking } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveSlot } from '../doctor/entities/wave-booking.entity';
import { DoctorProfile } from '../doctor/entities/doctor-profile.entity';
import { PatientProfile } from '../patient/entities/patient-profile.entity';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

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

    @InjectRepository(PatientProfile)
    private readonly patientProfileRepo: Repository<PatientProfile>,

    private readonly dataSource: DataSource,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Resolve userId → PatientProfile */
  private async getPatient(userId: string): Promise<PatientProfile> {
    const patient = await this.patientProfileRepo.findOne({ where: { userId } });
    if (!patient) {
      throw new NotFoundException(
        'Patient profile not found. Complete onboarding first via POST /patient/profile.',
      );
    }
    return patient;
  }

  /** Resolve userId → DoctorProfile */
  private async getDoctor(userId: string): Promise<DoctorProfile> {
    const doctor = await this.doctorProfileRepo.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found. Complete onboarding first via POST /doctor/profile.',
      );
    }
    return doctor;
  }

  /** Check whether a given date + startTime is strictly in the future */
  private assertFuture(date: string, startTime: string, label = 'Appointment'): void {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const appointmentDateTime = new Date(year, month - 1, day, hour, minute);
    if (appointmentDateTime <= new Date()) {
      throw new BadRequestException(
        `${label} cannot be in the past. Please select a future date and time.`,
      );
    }
  }

  /**
   * Assert that at least 30 minutes remain before the appointment starts.
   * Used for both cancellation and rescheduling cutoff enforcement.
   */
  private assertCutoff(date: string, startTime: string, action = 'cancel or reschedule'): void {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const appointmentTime = new Date(year, month - 1, day, hour, minute);
    const diffMins = (appointmentTime.getTime() - Date.now()) / (1000 * 60);
    if (diffMins <= 30) {
      throw new BadRequestException(
        `Cannot ${action} an appointment that starts in less than 30 minutes.`,
      );
    }
  }

  /** Find the next open WAVE slot for the doctor on a given date */
  private async nextAvailableWaveSlot(doctorId: string, date: string) {
    const slot = await this.waveSlotRepo.findOne({
      where: { doctorId, date, isBooked: false },
      order: { slotStart: 'ASC' },
    });
    if (!slot) return null;
    return { slotId: slot.id, startTime: slot.slotStart, endTime: slot.slotEnd, date };
  }

  /** Find the next STREAM session with remaining capacity for the doctor on a given date */
  private async nextAvailableStreamSession(doctorId: string, date: string) {
    const sessions = await this.streamScheduleRepo.find({
      where: { doctorId, date },
      order: { startTime: 'ASC' },
    });
    const available = sessions.find((s) => s.currentCount < s.maxPatients);
    if (!available) return null;
    return {
      streamId: available.id,
      startTime: available.startTime,
      endTime: available.endTime,
      date,
      tokensRemaining: available.maxPatients - available.currentCount,
    };
  }

  /** Shared appointment response shape */
  private formatAppointment(
    appt: Appointment,
    doctor?: DoctorProfile,
    patient?: PatientProfile,
  ) {
    return {
      id: appt.id,
      date: appt.date,
      startTime: appt.startTime,
      endTime: appt.endTime,
      status: appt.status,
      appointmentType: appt.appointmentType,
      schedulingType: appt.schedulingType,
      tokenNumber: appt.tokenNumber,
      cancelledAt: appt.cancelledAt,
      rescheduledAt: appt.rescheduledAt ?? null,
      rescheduleReason: appt.rescheduleReason ?? null,
      createdAt: appt.createdAt,
      ...(doctor && {
        doctor: {
          id: doctor.id,
          fullName: doctor.fullName,
          specialization: doctor.specialization,
          experienceYears: doctor.experienceYears,
          qualification: doctor.qualification,
        },
      }),
      ...(patient && {
        patient: {
          id: patient.id,
          fullName: patient.fullName,
          age: patient.age,
          gender: patient.gender,
          contactNumber: patient.contactNumber,
        },
      }),
    };
  }


  // ─── BOOK APPOINTMENT ─────────────────────────────────────────────────────

  /**
   * POST /appointment
   * Books a slot for the logged-in patient.
   *
   * Resolution order:
   *  1. Try to match a WAVE slot (exact startTime + endTime match)
   *  2. Else try to match a STREAM session (full window match)
   */
  async bookAppointment(userId: string, dto: CreateAppointmentDto) {
    const { doctorId, date, startTime, endTime } = dto;

    // 1. Future date/time guard
    this.assertFuture(date, startTime);

    // 2. Verify patient and doctor exist
    const patient = await this.getPatient(userId);
    const doctor = await this.doctorProfileRepo.findOne({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException(`Doctor with id "${doctorId}" not found.`);
    }

    // 3. Duplicate booking guard
    const duplicate = await this.appointmentRepo.findOne({
      where: { patientId: patient.id, doctorId, date, startTime, status: AppointmentStatus.BOOKED },
    });
    if (duplicate) {
      throw new ConflictException(
        'You have already booked this slot. Cannot book the same slot twice.',
      );
    }

    // 4a. Try WAVE slot match (startTime → slotStart, endTime → slotEnd)
    const waveSlot = await this.waveSlotRepo.findOne({
      where: { doctorId, date, slotStart: startTime, slotEnd: endTime },
      relations: ['wave'],
    });

    if (waveSlot) {
      if (waveSlot.isBooked) {
        throw new ConflictException(
          `The slot ${startTime}–${endTime} on ${date} is already booked. Please choose another slot.`,
        );
      }

      // Mark wave slot as booked
      waveSlot.isBooked = true;
      waveSlot.patientId = patient.id;
      waveSlot.bookedAt = new Date();
      await this.waveSlotRepo.save(waveSlot);

      // Create unified appointment record
      const appointment = await this.appointmentRepo.save(
        this.appointmentRepo.create({
          doctorId,
          patientId: patient.id,
          date,
          startTime,
          endTime,
          status: AppointmentStatus.BOOKED,
          appointmentType: AppointmentType.WAVE,
          schedulingType: waveSlot.wave?.schedulingType ?? SchedulingType.RECURRING,
          tokenNumber: null,
          streamBookingId: null,
          waveSlotId: waveSlot.id,
          cancelledAt: null,
        }),
      );

      return {
        message: 'Appointment booked successfully! You have an exact appointment time.',
        ...this.formatAppointment(appointment, doctor, patient),
      };
    }

    // 4b. Try STREAM session match (full window startTime + endTime)
    const streamSession = await this.streamScheduleRepo.findOne({
      where: { doctorId, date, startTime, endTime },
    });

    if (!streamSession) {
      throw new NotFoundException(
        `No session or slot found for ${startTime}–${endTime} on ${date} with this doctor. ` +
          'Use GET /patient/schedule/available to view available slots.',
      );
    }

    if (streamSession.currentCount >= streamSession.maxPatients) {
      throw new ConflictException(
        `This session is fully booked (${streamSession.maxPatients}/${streamSession.maxPatients} tokens issued). ` +
          'No more bookings available.',
      );
    }

    // Issue next token
    const tokenNumber = streamSession.currentCount + 1;
    const streamBooking = await this.streamBookingRepo.save(
      this.streamBookingRepo.create({
        streamId: streamSession.id,
        patientId: patient.id,
        tokenNumber,
        bookedAt: new Date(),
      }),
    );

    streamSession.currentCount += 1;
    await this.streamScheduleRepo.save(streamSession);

    // Create unified appointment record
    const appointment = await this.appointmentRepo.save(
      this.appointmentRepo.create({
        doctorId,
        patientId: patient.id,
        date,
        startTime,
        endTime,
        status: AppointmentStatus.BOOKED,
        appointmentType: AppointmentType.STREAM,
        schedulingType: streamSession.schedulingType,
        tokenNumber,
        streamBookingId: streamBooking.id,
        waveSlotId: null,
        cancelledAt: null,
      }),
    );

    return {
      message: `Appointment booked! You are Token #${tokenNumber}. Please arrive within the session window.`,
      ...this.formatAppointment(appointment, doctor, patient),
    };
  }

  // ─── PATIENT: VIEW MY APPOINTMENTS ────────────────────────────────────────

  /**
   * GET /appointment/my
   * Returns the logged-in patient's complete appointment history.
   */
  async getMyAppointments(userId: string) {
    const patient = await this.getPatient(userId);

    const appointments = await this.appointmentRepo.find({
      where: { patientId: patient.id },
      relations: ['doctor'],
      order: { date: 'DESC', startTime: 'ASC' },
    });

    if (appointments.length === 0) {
      return { message: 'No appointments found.', appointments: [] };
    }

    return {
      total: appointments.length,
      appointments: appointments.map((a) => this.formatAppointment(a, a.doctor)),
    };
  }

  // ─── PATIENT: CANCEL APPOINTMENT ─────────────────────────────────────────

  /**
   * PATCH /appointment/:id/cancel
   * Cancels an appointment and rolls back the slot.
   */
  async cancelAppointment(userId: string, appointmentId: string) {
    const patient = await this.getPatient(userId);

    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment "${appointmentId}" not found.`);
    }

    // Ownership guard
    if (appointment.patientId !== patient.id) {
      throw new ForbiddenException('You can only cancel your own appointments.');
    }

    // Already cancelled guard
    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new ConflictException('This appointment is already cancelled.');
    }

    // Past appointment guard
    this.assertFuture(appointment.date, appointment.startTime);

    // ── Rollback the underlying slot ────────────────────────────────────────
    if (appointment.appointmentType === AppointmentType.WAVE && appointment.waveSlotId) {
      const slot = await this.waveSlotRepo.findOne({ where: { id: appointment.waveSlotId } });
      if (slot) {
        slot.isBooked = false;
        slot.patientId = null;
        slot.bookedAt = null;
        await this.waveSlotRepo.save(slot);
      }
    } else if (appointment.appointmentType === AppointmentType.STREAM && appointment.streamBookingId) {
      const booking = await this.streamBookingRepo.findOne({
        where: { id: appointment.streamBookingId },
      });
      if (booking) {
        const session = await this.streamScheduleRepo.findOne({
          where: { id: booking.streamId },
        });
        if (session) {
          session.currentCount = Math.max(0, session.currentCount - 1);
          await this.streamScheduleRepo.save(session);
        }
        await this.streamBookingRepo.remove(booking);
      }
    }

    // Update appointment status
    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancelledAt = new Date();
    await this.appointmentRepo.save(appointment);

    return {
      message: 'Appointment cancelled successfully. The slot is now available for others.',
      appointmentId: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      cancelledAt: appointment.cancelledAt,
    };
  }

  // ─── PATIENT: RESCHEDULE APPOINTMENT ─────────────────────────────────────

  /**
   * PATCH /appointment/:id/reschedule
   * Moves a WAVE or STREAM appointment to a new slot/session.
   * Rules:
   *  - 30-minute cutoff: cannot reschedule within 30 mins of current start.
   *  - Cannot reschedule to the same slot (date + startTime + endTime identical).
   *  - Atomic swap: releases old slot/token before claiming the new one.
   */
  async rescheduleAppointment(
    userId: string,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
  ) {
    const { newDate, newStartTime, newEndTime, reason } = dto;
    const patient = await this.getPatient(userId);

    const appointment = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException(`Appointment "${appointmentId}" not found.`);
    if (appointment.patientId !== patient.id)
      throw new ForbiddenException('You can only reschedule your own appointments.');
    if (appointment.status === AppointmentStatus.CANCELLED)
      throw new ConflictException('Cannot reschedule a cancelled appointment.');

    // 30-minute cutoff on CURRENT appointment
    this.assertCutoff(appointment.date, appointment.startTime, 'reschedule');

    // Same-slot guard
    if (
      appointment.date === newDate &&
      appointment.startTime === newStartTime &&
      appointment.endTime === newEndTime
    ) {
      throw new BadRequestException(
        'The new slot is the same as the current appointment. Please choose a different time.',
      );
    }

    // New slot must be in the future
    this.assertFuture(newDate, newStartTime, 'New appointment slot');

    const previousSlot = {
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      type: appointment.appointmentType,
    };

    return this.dataSource.transaction(async (em) => {
      // ── WAVE appointment ───────────────────────────────────────────────────
      if (appointment.appointmentType === AppointmentType.WAVE) {
        // Release old slot
        if (appointment.waveSlotId) {
          await em.update(WaveSlot, appointment.waveSlotId, {
            isBooked: false, patientId: null, bookedAt: null,
          });
        }

        // Find and claim new slot
        const newSlot = await em.findOne(WaveSlot, {
          where: { doctorId: appointment.doctorId, date: newDate, slotStart: newStartTime, slotEnd: newEndTime },
        });
        if (!newSlot) {
          const suggestion = await this.nextAvailableWaveSlot(appointment.doctorId, newDate);
          throw new NotFoundException({
            message: `No wave slot found for ${newStartTime}–${newEndTime} on ${newDate}. Use GET /patient/schedule/available to find available slots.`,
            suggestion,
          });
        }
        if (newSlot.isBooked) {
          const suggestion = await this.nextAvailableWaveSlot(appointment.doctorId, newDate);
          throw new ConflictException({
            message: `The slot ${newStartTime}–${newEndTime} on ${newDate} is already booked.`,
            suggestion,
          });
        }

        await em.update(WaveSlot, newSlot.id, {
          isBooked: true, patientId: patient.id, bookedAt: new Date(),
        });

        await em.update(Appointment, appointmentId, {
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          waveSlotId: newSlot.id,
          status: AppointmentStatus.RESCHEDULED,
          rescheduledAt: new Date(),
          rescheduleReason: reason ?? null,
        });

        return {
          message: 'Appointment rescheduled successfully! Your new slot is confirmed.',
          previousSlot,
          newSlot: { date: newDate, startTime: newStartTime, endTime: newEndTime },
          status: AppointmentStatus.RESCHEDULED,
        };
      }

      // ── STREAM appointment ─────────────────────────────────────────────────
      if (appointment.appointmentType === AppointmentType.STREAM) {
        // Release old token
        if (appointment.streamBookingId) {
          const oldBooking = await em.findOne(StreamBooking, { where: { id: appointment.streamBookingId } });
          if (oldBooking) {
            const oldSession = await em.findOne(StreamSchedule, { where: { id: oldBooking.streamId } });
            if (oldSession) {
              await em.update(StreamSchedule, oldSession.id, {
                currentCount: Math.max(0, oldSession.currentCount - 1),
              });
            }
            await em.remove(StreamBooking, oldBooking);
          }
        }

        // Find and claim new session
        const newSession = await em.findOne(StreamSchedule, {
          where: { doctorId: appointment.doctorId, date: newDate, startTime: newStartTime, endTime: newEndTime },
        });
        if (!newSession) {
          const suggestion = await this.nextAvailableStreamSession(appointment.doctorId, newDate);
          throw new NotFoundException({
            message: `No stream session found for ${newStartTime}–${newEndTime} on ${newDate}.`,
            suggestion,
          });
        }
        if (newSession.currentCount >= newSession.maxPatients) {
          const suggestion = await this.nextAvailableStreamSession(appointment.doctorId, newDate);
          throw new ConflictException({
            message: `Stream session is full (${newSession.maxPatients}/${newSession.maxPatients} tokens issued).`,
            suggestion,
          });
        }

        const newToken = newSession.currentCount + 1;
        const newBooking = await em.save(StreamBooking,
          em.create(StreamBooking, { streamId: newSession.id, patientId: patient.id, tokenNumber: newToken, bookedAt: new Date() }),
        );
        await em.update(StreamSchedule, newSession.id, { currentCount: newToken });

        await em.update(Appointment, appointmentId, {
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          tokenNumber: newToken,
          streamBookingId: newBooking.id,
          status: AppointmentStatus.RESCHEDULED,
          rescheduledAt: new Date(),
          rescheduleReason: reason ?? null,
        });

        return {
          message: 'Appointment rescheduled successfully! Your new token is confirmed.',
          previousSlot,
          newSession: { date: newDate, startTime: newStartTime, endTime: newEndTime, tokenNumber: newToken },
          status: AppointmentStatus.RESCHEDULED,
        };
      }

      throw new BadRequestException('Unsupported appointment type for rescheduling.');
    });
  }

  // ─── DOCTOR: VIEW MY APPOINTMENTS ────────────────────────────────────────

  /**
   * GET /doctor/appointments?status=BOOKED&date=YYYY-MM-DD
   * Returns all appointments for the logged-in doctor with optional filters.
   */
  async getDoctorAppointments(
    userId: string,
    status?: string,
    date?: string,
  ) {
    const doctor = await this.getDoctor(userId);

    const where: Record<string, unknown> = { doctorId: doctor.id };
    if (status) where.status = status;
    if (date) where.date = date;

    const appointments = await this.appointmentRepo.find({
      where,
      relations: ['patient'],
      order: { date: 'ASC', startTime: 'ASC' },
    });

    if (appointments.length === 0) {
      return { message: 'No appointments found.', appointments: [] };
    }

    return {
      total: appointments.length,
      appointments: appointments.map((a) => this.formatAppointment(a, undefined, a.patient)),
    };
  }
}
