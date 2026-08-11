import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { PatientProfile } from '../patient/entities/patient-profile.entity';

export interface CreateNotificationDto {
  patientId: string;
  appointmentId: string | null;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    @InjectRepository(PatientProfile)
    private readonly patientProfileRepo: Repository<PatientProfile>,
  ) {}

  /** Resolve patientProfile.id from User.id (userId from JWT payload user.id) */
  private async resolvePatientId(userId: string): Promise<string> {
    const patient = await this.patientProfileRepo.findOne({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found.');
    return patient.id;
  }

  /**
   * Creates a notification for a patient.
   *
   * - Non-blocking: failure is logged and never throws or rolls back transactions.
   * - Unique constraint UQ_notification_appt_type ensures duplicate events are skipped.
   */
  async createNotification(dto: CreateNotificationDto): Promise<void> {
    try {
      const notification = this.notificationRepo.create({
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        isRead: false,
      });
      await this.notificationRepo.save(notification);
    } catch (err) {
      this.logger.warn(
        `[NotificationService] Could not create notification (${dto.type}) for patient ${dto.patientId}: ${err?.message}`,
      );
    }
  }

  /**
   * GET /notification/my
   * Returns all notifications for the patient (resolved from userId), sorted latest-first.
   * Optionally filter by unread using ?filter=unread.
   */
  async getMyNotifications(userId: string, filterUnread?: boolean) {
    const patientId = await this.resolvePatientId(userId);

    const query = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.patientId = :patientId', { patientId })
      .orderBy('n.createdAt', 'DESC');

    if (filterUnread) {
      query.andWhere('n.isRead = false');
    }

    const notifications = await query.getMany();
    const unreadCount = await this.notificationRepo.count({
      where: { patientId, isRead: false },
    });

    return {
      unreadCount,
      total: notifications.length,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        appointmentId: n.appointmentId,
        createdAt: n.createdAt,
      })),
    };
  }

  /**
   * PATCH /notification/:id/read
   * Marks a single notification as read.
   */
  async markAsRead(notificationId: string, userId: string): Promise<{ message: string }> {
    const patientId = await this.resolvePatientId(userId);

    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, patientId },
    });

    if (!notification) {
      return { message: 'Notification not found or already processed.' };
    }

    notification.isRead = true;
    await this.notificationRepo.save(notification);
    return { message: 'Notification marked as read.' };
  }

  /**
   * PATCH /notification/read-all
   * Marks all notifications for this patient as read.
   */
  async markAllAsRead(userId: string): Promise<{ message: string; updatedCount: number }> {
    const patientId = await this.resolvePatientId(userId);

    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('"patientId" = :patientId AND "isRead" = false', { patientId })
      .execute();

    return {
      message: 'All notifications marked as read.',
      updatedCount: result.affected ?? 0,
    };
  }
}
