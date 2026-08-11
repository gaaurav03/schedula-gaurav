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
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';

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
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getPatient(userId: string): Promise<PatientProfile> {
    const patient = await this.patientProfileRepo.findOne({ where: { userId } });
    if (!patient) {
      throw new NotFoundException(
        'Patient profile not found. Complete onboarding first via POST /patient/profile.',
      );
    }
    return patient;
  }

  private async getDoctor(userId: string): Promise<DoctorProfile> {
    const doctor = await this.doctorProfileRepo.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found. Complete onboarding first via POST /doctor/profile.',
      );
    }
    return doctor;
  }

  /** Assert that date+startTime is strictly in the future */
  private assertFuture(date: string, startTime: string, label = 'Appointment'): void {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const dt = new Date(year, month - 1, day, hour, minute);
    if (dt <= new Date()) {
      throw new BadRequestException(
        `${label} cannot be in the past. Please select a future date and time.`,
      );
    }
  }

  /**
   * Assert that at least 30 minutes remain before the appointment.
   * Used for both cancellation and rescheduling.
   */
  private assertCutoff(date: string, startTime: string, action = 'cancel or reschedule'): void {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const appointmentTime = new Date(year, month - 1, day, hour, minute);
    const now = new Date();
    const diffMs = appointmentTime.getTime() - now.getTime();
    const diffMins = diffMs / (1000 * 60);

    if (diffMins <= 30) {
      throw new BadRequestException(
        `Cannot ${action} an appointment that starts in less than 30 minutes.`,
      );
    }
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

  // ─── Next-Available Slot Suggestion Helpers ───────────────────────────────

  /** Find the next open WAVE slot for the doctor on a date */
  private async nextAvailableWaveSlot(doctorId: string, date: string) {
    const slot = await this.waveSlotRepo.findOne({
      where: { doctorId, date, isBooked: false },
      order: { slotStart: 'ASC' },
    });
    if (!slot) return null;
    return { slotId: slot.id, startTime: slot.slotStart, endTime: slot.slotEnd, date };
  }

  /** Find the next STREAM session with remaining capacity for the doctor on a date */
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

  // ─── BOOK APPOINTMENT ─────────────────────────────────────────────────────

  /**
   * POST /appointment
   * Resolution order: WAVE slot match first, then STREAM session match.
   */
  async bookAppointment(userId: string, dto: CreateAppointmentDto) {
    const { doctorId, date, startTime, endTime } = dto;

    this.assertFuture(date, startTime);

    const patient = await this.getPatient(userId);
    const doctor = await this.doctorProfileRepo.findOne({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException(`Doctor with id "${doctorId}" not found.`);

    // Duplicate booking guard
    const duplicate = await this.appointmentRepo.findOne({
      where: { patientId: patient.id, doctorId, date, startTime, status: AppointmentStatus.BOOKED },
    });
    if (duplicate) {
      throw new ConflictException('You have already booked this slot. Cannot book the same slot twice.');
    }

    // ── Try WAVE slot match ─────────────────────────────────────────────────
    const waveSlot = await this.waveSlotRepo.findOne({
      where: { doctorId, date, slotStart: startTime, slotEnd: endTime },
      relations: ['wave'],
    });

    if (waveSlot) {
      if (waveSlot.isBooked) {
        const suggestion = await this.nextAvailableWaveSlot(doctorId, date);
        throw new ConflictException({
          message: `The slot ${startTime}–${endTime} on ${date} is already booked. Please choose another slot.`,
          suggestion,
        });
      }

      waveSlot.isBooked = true;
      waveSlot.patientId = patient.id;
      waveSlot.bookedAt = new Date();
      await this.waveSlotRepo.save(waveSlot);

      const appointment = await this.appointmentRepo.save(
        this.appointmentRepo.create({
          doctorId,
          patientId: patient.id,
          date, startTime, endTime,
          status: AppointmentStatus.BOOKED,
          appointmentType: AppointmentType.WAVE,
          schedulingType: waveSlot.wave?.schedulingType ?? SchedulingType.RECURRING,
          tokenNumber: null, streamBookingId: null,
          waveSlotId: waveSlot.id,
          cancelledAt: null, rescheduledAt: null, rescheduleReason: null,
        }),
      );

      // Non-blocking notification
      void this.notificationService.createNotification({
        patientId: patient.id,
        appointmentId: appointment.id,
        type: NotificationType.APPOINTMENT_BOOKED,
        title: 'Appointment Booked',
        message: `Your appointment with Dr. ${doctor.fullName} has been booked successfully for ${date} at ${startTime}.`,
      });

      return { message: 'Appointment booked successfully! You have an exact appointment time.', ...this.formatAppointment(appointment, doctor, patient) };
    }

    // ── Try STREAM session match ────────────────────────────────────────────
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
      const suggestion = await this.nextAvailableStreamSession(doctorId, date);
      throw new ConflictException({
        message: `This session is fully booked (${streamSession.maxPatients}/${streamSession.maxPatients} tokens issued).`,
        suggestion,
      });
    }

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

    const appointment = await this.appointmentRepo.save(
      this.appointmentRepo.create({
        doctorId,
        patientId: patient.id,
        date, startTime, endTime,
        status: AppointmentStatus.BOOKED,
        appointmentType: AppointmentType.STREAM,
        schedulingType: streamSession.schedulingType,
        tokenNumber,
        streamBookingId: streamBooking.id,
        waveSlotId: null,
        cancelledAt: null, rescheduledAt: null, rescheduleReason: null,
      }),
    );

    // Non-blocking notification
    void this.notificationService.createNotification({
      patientId: patient.id,
      appointmentId: appointment.id,
      type: NotificationType.APPOINTMENT_BOOKED,
      title: 'Appointment Booked',
      message: `Your appointment with Dr. ${doctor.fullName} has been booked successfully for ${date} at ${startTime}.`,
    });

    return {
      message: 'Appointment booked successfully! Please arrive within the session time window.',
      tokensRemaining: `${streamSession.maxPatients - streamSession.currentCount}/${streamSession.maxPatients} remaining`,
      ...this.formatAppointment(appointment, doctor, patient),
    };
  }

  // ─── RESCHEDULE APPOINTMENT ───────────────────────────────────────────────

  /**
   * PATCH /appointment/:id/reschedule
   * Atomically releases the old slot and reserves the new one.
   * Supports same-slot-type rescheduling (WAVE→WAVE, STREAM→STREAM).
   * Returns a "next available" suggestion when the target slot/session is unavailable.
   */
  async rescheduleAppointment(
    userId: string,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
  ) {
    const { newDate, newStartTime, newEndTime, reason } = dto;

    const appointment = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException(`Appointment "${appointmentId}" not found.`);

    const patient = await this.getPatient(userId);

    if (appointment.patientId !== patient.id) {
      throw new ForbiddenException('You can only reschedule your own appointments.');
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot reschedule a cancelled appointment.');
    }

    // 30-min cutoff on OLD appointment
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

    // Future guard on NEW slot
    this.assertFuture(newDate, newStartTime, 'New slot');

    const doctor = await this.doctorProfileRepo.findOne({ where: { id: appointment.doctorId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found.');

    // ── WAVE Rescheduling ──────────────────────────────────────────────────
    if (appointment.appointmentType === AppointmentType.WAVE) {
      const newSlot = await this.waveSlotRepo.findOne({
        where: {
          doctorId: appointment.doctorId,
          date: newDate,
          slotStart: newStartTime,
          slotEnd: newEndTime,
        },
        relations: ['wave'],
      });

      if (!newSlot) {
        const suggestion = await this.nextAvailableWaveSlot(appointment.doctorId, newDate);
        throw new BadRequestException({
          message: `No wave slot found for ${newStartTime}–${newEndTime} on ${newDate}. Use GET /patient/schedule/available to find slots.`,
          suggestion,
        });
      }

      if (newSlot.isBooked) {
        const suggestion = await this.nextAvailableWaveSlot(appointment.doctorId, newDate);
        throw new ConflictException({
          message: `The slot ${newStartTime}–${newEndTime} on ${newDate} is already booked by another patient.`,
          suggestion,
        });
      }

      // ── Atomic: release old slot + reserve new slot ─────────────────────
      await this.dataSource.transaction(async (manager) => {
        if (appointment.waveSlotId) {
          await manager.update(WaveSlot, appointment.waveSlotId, {
            isBooked: false,
            patientId: null,
            bookedAt: null,
          });
        }

        await manager.update(WaveSlot, newSlot.id, {
          isBooked: true,
          patientId: patient.id,
          bookedAt: new Date(),
        });

        await manager.update(Appointment, appointment.id, {
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          waveSlotId: newSlot.id,
          status: AppointmentStatus.RESCHEDULED,
          rescheduledAt: new Date(),
          rescheduleReason: reason ?? null,
        });
      });

      const updated = await this.appointmentRepo.findOne({ where: { id: appointment.id } });

      // Non-blocking notification
      void this.notificationService.createNotification({
        patientId: patient.id,
        appointmentId: appointment.id,
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        title: 'Appointment Rescheduled',
        message: `Your appointment with Dr. ${doctor.fullName} has been rescheduled to ${newDate} at ${newStartTime}.`,
      });

      return {
        message: 'Appointment rescheduled successfully! Your new slot is confirmed.',
        previousSlot: { date: appointment.date, startTime: appointment.startTime, endTime: appointment.endTime },
        ...this.formatAppointment(updated!, doctor, patient),
      };
    }

    // ── STREAM Rescheduling ───────────────────────────────────────────────
    if (appointment.appointmentType === AppointmentType.STREAM) {
      const newSession = await this.streamScheduleRepo.findOne({
        where: {
          doctorId: appointment.doctorId,
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
        },
      });

      if (!newSession) {
        const suggestion = await this.nextAvailableStreamSession(appointment.doctorId, newDate);
        throw new BadRequestException({
          message: `No stream session found for ${newStartTime}–${newEndTime} on ${newDate}. Use GET /patient/schedule/available to find sessions.`,
          suggestion,
        });
      }

      if (newSession.currentCount >= newSession.maxPatients) {
        const suggestion = await this.nextAvailableStreamSession(appointment.doctorId, newDate);
        throw new ConflictException({
          message: `The session ${newStartTime}–${newEndTime} on ${newDate} is full (${newSession.maxPatients}/${newSession.maxPatients} tokens).`,
          suggestion,
        });
      }

      let newTokenNumber: number;

      await this.dataSource.transaction(async (manager) => {
        if (appointment.streamBookingId) {
          const oldBooking = await manager.findOne(StreamBooking, {
            where: { id: appointment.streamBookingId },
          });
          if (oldBooking) {
            const oldSession = await manager.findOne(StreamSchedule, {
              where: { id: oldBooking.streamId },
            });
            if (oldSession) {
              await manager.update(StreamSchedule, oldSession.id, {
                currentCount: Math.max(0, oldSession.currentCount - 1),
              });
            }
            await manager.remove(StreamBooking, oldBooking);
          }
        }

        newTokenNumber = newSession.currentCount + 1;
        const newBooking = manager.create(StreamBooking, {
          streamId: newSession.id,
          patientId: patient.id,
          tokenNumber: newTokenNumber,
          bookedAt: new Date(),
        });
        const savedBooking = await manager.save(StreamBooking, newBooking);

        await manager.update(StreamSchedule, newSession.id, {
          currentCount: newSession.currentCount + 1,
        });

        await manager.update(Appointment, appointment.id, {
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          tokenNumber: newTokenNumber,
          streamBookingId: savedBooking.id,
          status: AppointmentStatus.RESCHEDULED,
          rescheduledAt: new Date(),
          rescheduleReason: reason ?? null,
        });
      });

      const updated = await this.appointmentRepo.findOne({ where: { id: appointment.id } });

      // Non-blocking notification
      void this.notificationService.createNotification({
        patientId: patient.id,
        appointmentId: appointment.id,
        type: NotificationType.APPOINTMENT_RESCHEDULED,
        title: 'Appointment Rescheduled',
        message: `Your appointment with Dr. ${doctor.fullName} has been rescheduled to ${newDate} at ${newStartTime}.`,
      });

      return {
        message: `Appointment rescheduled! Your new token is #${newTokenNumber!}. Please arrive within the new session window.`,
        previousSession: { date: appointment.date, startTime: appointment.startTime, endTime: appointment.endTime },
        ...this.formatAppointment(updated!, doctor, patient),
      };
    }

    throw new BadRequestException('Invalid appointment type. Cannot reschedule this appointment.');
  }

  // ─── PATIENT: VIEW MY APPOINTMENTS ────────────────────────────────────────

  async getMyAppointments(userId: string) {
    const patient = await this.getPatient(userId);
    const appointments = await this.appointmentRepo.find({
      where: { patientId: patient.id },
      relations: ['doctor'],
      order: { date: 'DESC', startTime: 'ASC' },
    });

    if (appointments.length === 0) return { message: 'No appointments found.', appointments: [] };
    return { total: appointments.length, appointments: appointments.map((a) => this.formatAppointment(a, a.doctor)) };
  }

  // ─── PATIENT: CANCEL APPOINTMENT ─────────────────────────────────────────

  /**
   * PATCH /appointment/:id/cancel
   * Cancels an appointment and rolls back the underlying slot.
   * Enforces 30-minute cutoff rule.
   */
  async cancelAppointment(userId: string, appointmentId: string) {
    const patient = await this.getPatient(userId);

    const appointment = await this.appointmentRepo.findOne({ where: { id: appointmentId } });
    if (!appointment) throw new NotFoundException(`Appointment "${appointmentId}" not found.`);

    if (appointment.patientId !== patient.id) {
      throw new ForbiddenException('You can only cancel your own appointments.');
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new ConflictException('This appointment is already cancelled.');
    }

    // Past appointment guard
    this.assertFuture(appointment.date, appointment.startTime);

    // 30-minute cutoff guard
    this.assertCutoff(appointment.date, appointment.startTime, 'cancel');

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
      const booking = await this.streamBookingRepo.findOne({ where: { id: appointment.streamBookingId } });
      if (booking) {
        const session = await this.streamScheduleRepo.findOne({ where: { id: booking.streamId } });
        if (session) {
          session.currentCount = Math.max(0, session.currentCount - 1);
          await this.streamScheduleRepo.save(session);
        }
        await this.streamBookingRepo.remove(booking);
      }
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancelledAt = new Date();
    await this.appointmentRepo.save(appointment);

    const doctorForNotif = await this.doctorProfileRepo.findOne({ where: { id: appointment.doctorId } });

    // Non-blocking notification
    void this.notificationService.createNotification({
      patientId: patient.id,
      appointmentId: appointment.id,
      type: NotificationType.APPOINTMENT_CANCELLED,
      title: 'Appointment Cancelled',
      message: `Your appointment with Dr. ${doctorForNotif?.fullName ?? 'your doctor'} scheduled on ${appointment.date} at ${appointment.startTime} has been cancelled.`,
    });

    return {
      message: 'Appointment cancelled successfully. The slot is now available for others.',
      appointmentId: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      cancelledAt: appointment.cancelledAt,
    };
  }

  // ─── DOCTOR: VIEW MY APPOINTMENTS ────────────────────────────────────────

  async getDoctorAppointments(userId: string, status?: string, date?: string) {
    const doctor = await this.getDoctor(userId);
    const where: Record<string, unknown> = { doctorId: doctor.id };
    if (status) where.status = status;
    if (date) where.date = date;

    const appointments = await this.appointmentRepo.find({
      where,
      relations: ['patient'],
      order: { date: 'ASC', startTime: 'ASC' },
    });

    if (appointments.length === 0) return { message: 'No appointments found.', appointments: [] };
    return { total: appointments.length, appointments: appointments.map((a) => this.formatAppointment(a, undefined, a.patient)) };
  }
}
