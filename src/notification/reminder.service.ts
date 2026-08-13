import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus, AppointmentType } from '../appointment/entities/appointment.entity';
import { DoctorProfile } from '../doctor/entities/doctor-profile.entity';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationService } from './notification.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  /**
   * How far ahead (in hours) we look for appointments to remind.
   * Appointments whose date+startTime falls within (now, now + REMINDER_WINDOW_HOURS]
   * will receive a reminder notification.
   */
  private readonly REMINDER_WINDOW_HOURS = 24;

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,

    @InjectRepository(DoctorProfile)
    private readonly doctorProfileRepo: Repository<DoctorProfile>,

    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    private readonly notificationService: NotificationService,
  ) {}

  // ─── Scheduled Cron Job ───────────────────────────────────────────────────

  /**
   * Runs every hour at the top of the hour.
   * Scans for BOOKED appointments within the next 24 hours and sends reminders.
   *
   * Cron expression: `0 * * * *`
   *   - Field 0 (minute): 0   → at minute 0
   *   - Field 1 (hour):   *   → every hour
   *   - Fields 2-5: any day, month, weekday
   */
  @Cron('0 * * * *', { name: 'appointment-reminder-cron' })
  async handleReminderCron(): Promise<void> {
    this.logger.log('[ReminderCron] Cron job triggered — scanning for upcoming appointments...');
    const result = await this.sendReminders();
    this.logger.log(
      `[ReminderCron] Completed. Reminders sent: ${result.remindersSent}, Skipped: ${result.skipped}.`,
    );
  }

  // ─── Core Logic (also called by manual trigger endpoint) ──────────────────

  /**
   * Finds all BOOKED appointments within the next 24 hours that have NOT yet
   * received an APPOINTMENT_REMINDER notification, then creates reminders for them.
   *
   * Returns a summary object with counts for use by both the cron job and the
   * manual trigger endpoint.
   */
  async sendReminders(): Promise<{
    remindersSent: number;
    skipped: number;
    message: string;
    details: string[];
  }> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

    // ── 1. Fetch BOOKED appointments within the reminder window ──────────────
    //
    // Appointment dates/times are stored as local (IST) strings:
    //   date:      'YYYY-MM-DD'
    //   startTime: 'HH:mm'
    //
    // We compare them as plain strings: 'YYYY-MM-DD HH:mm' is lexicographically
    // sortable, so string comparison gives correct chronological ordering.
    //
    // WHY NOT toISOString():
    //   toISOString() returns UTC (e.g. 12:54Z for 18:24 IST). TO_TIMESTAMP on the
    //   stored local string '15:40' has no timezone info, so PostgreSQL treats it as
    //   the DB session timezone (UTC). This causes '15:40 UTC' to appear > '12:54 UTC
    //   + 24h window', making the appointment appear outside the window — even though
    //   it is only 21h away in IST.
    //
    // FIX: Format now/windowEnd using LOCAL getters (getHours, getDate, etc.) so the
    //      boundary strings are in the same timezone as the stored appointment strings.

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalStr = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const nowStr = toLocalStr(now);
    const windowEndStr = toLocalStr(windowEnd);

    this.logger.log(
      `[ReminderService] Scanning window: ${nowStr} → ${windowEndStr} (local time)`,
    );

    const appointments = await this.appointmentRepo
      .createQueryBuilder('appt')
      .leftJoin(
        Notification,
        'notif',
        'notif."appointmentId" = appt.id AND notif."type" = :reminderType',
        { reminderType: NotificationType.APPOINTMENT_REMINDER },
      )
      .where('appt.status = :status', { status: AppointmentStatus.BOOKED })
      .andWhere('notif.id IS NULL') // No reminder sent yet
      .andWhere(
        `(appt.date || ' ' || appt."startTime") > :nowStr`,
        { nowStr },
      )
      .andWhere(
        `(appt.date || ' ' || appt."startTime") <= :windowEndStr`,
        { windowEndStr },
      )
      .getMany();

    if (appointments.length === 0) {
      this.logger.log('[ReminderService] No appointments need reminders at this time.');
      return {
        remindersSent: 0,
        skipped: 0,
        message: 'No upcoming appointments found within the reminder window.',
        details: [],
      };
    }

    this.logger.log(
      `[ReminderService] Found ${appointments.length} appointment(s) needing reminders.`,
    );

    // ── 2. Process each appointment ──────────────────────────────────────────

    let remindersSent = 0;
    let skipped = 0;
    const details: string[] = [];

    for (const appt of appointments) {
      try {
        // Load doctor profile for the name
        const doctor = await this.doctorProfileRepo.findOne({
          where: { id: appt.doctorId },
        });

        if (!doctor) {
          this.logger.warn(
            `[ReminderService] Skipping appointment ${appt.id}: doctor profile not found (doctorId=${appt.doctorId}).`,
          );
          skipped++;
          details.push(`SKIPPED appt ${appt.id}: doctor not found`);
          continue;
        }

        // ── Build message based on appointment type ────────────────────────
        const { title, message } = this.buildReminderMessage(appt, doctor);

        // ── Send notification (non-blocking; duplicate constraint handles idempotency) ─
        await this.notificationService.createNotification({
          patientId: appt.patientId,
          appointmentId: appt.id,
          type: NotificationType.APPOINTMENT_REMINDER,
          title,
          message,
        });

        remindersSent++;
        details.push(
          `SENT reminder to patient ${appt.patientId} for appt ${appt.id} ` +
          `(${appt.appointmentType}, ${appt.date} ${appt.startTime})`,
        );

        this.logger.log(
          `[ReminderService] Reminder sent → appointment ${appt.id} | ${appt.appointmentType} | ${appt.date} ${appt.startTime}`,
        );
      } catch (err) {
        // Non-fatal: log and continue processing remaining appointments
        this.logger.error(
          `[ReminderService] Failed to process appointment ${appt.id}: ${err?.message}`,
        );
        skipped++;
        details.push(`ERROR appt ${appt.id}: ${err?.message}`);
      }
    }

    return {
      remindersSent,
      skipped,
      message: `Reminder run complete. Sent: ${remindersSent}, Skipped: ${skipped}.`,
      details,
    };
  }

  // ─── Message Builder ─────────────────────────────────────────────────────

  /**
   * Builds the reminder title and message based on the appointment scheduling type.
   *
   * STREAM appointments:
   *   Patient has a token number and reports at the session start time.
   *   Message includes the reporting time and token number.
   *
   * WAVE appointments:
   *   Patient has an exact fixed time slot.
   *   Message includes the exact appointment time window.
   */
  private buildReminderMessage(
    appt: Appointment,
    doctor: DoctorProfile,
  ): { title: string; message: string } {
    const title = 'Appointment Reminder';

    if (appt.appointmentType === AppointmentType.STREAM) {
      // STREAM: token-based, patient has a reporting time + token number
      const message =
        `Reminder: You have an appointment with Dr. ${doctor.fullName} on ${appt.date}.\n` +
        `Reporting Time: ${this.formatTime(appt.startTime)}\n` +
        `Token Number: ${appt.tokenNumber ?? 'N/A'}`;
      return { title, message };
    }

    // WAVE: exact slot, patient has a fixed start–end window
    const message =
      `Reminder: You have an appointment with Dr. ${doctor.fullName} on ${appt.date}.\n` +
      `Appointment Time: ${this.formatTime(appt.startTime)} - ${this.formatTime(appt.endTime)}`;
    return { title, message };
  }

  /**
   * Converts "HH:mm" (24-hour) → "h:mm AM/PM" for human-readable display.
   * Example: "14:30" → "2:30 PM", "09:00" → "9:00 AM"
   */
  private formatTime(time: string): string {
    const [hourStr, minuteStr] = time.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = minuteStr;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${minute} ${period}`;
  }
}
