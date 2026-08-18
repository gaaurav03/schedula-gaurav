import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../users/user.entity';
import { NotificationService } from './notification.service';
import { ReminderService } from './reminder.service';

@Controller('notification')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly reminderService: ReminderService,
  ) {}

  // ─── DOCTOR-only Routes ───────────────────────────────────────────────────

  /**
   * POST /notification/trigger-reminders
   *
   * Manually triggers the appointment reminder cron logic.
   * Useful for testing without waiting for the scheduled cron to fire.
   *
   * Scans all BOOKED appointments within the next 24 hours and sends
   * reminder notifications to patients who haven't received one yet.
   *
   * ✅ DOCTOR only
   */
  @Post('trigger-reminders')
  @Roles(Role.DOCTOR)
  @HttpCode(HttpStatus.OK)
  async triggerReminders() {
    return this.reminderService.sendReminders();
  }

  // ─── PATIENT-only Routes ──────────────────────────────────────────────────

  /**
   * GET /notification/my
   *
   * Returns all notifications for the logged-in patient, sorted latest-first.
   * Includes unreadCount and total.
   *
   * Query params:
   *   ?filter=unread  → Return only unread notifications
   */
  @Get('my')
  @Roles(Role.PATIENT)
  async getMyNotifications(
    @GetUser() user: { id: string },
    @Query('filter') filter?: string,
  ) {
    return this.notificationService.getMyNotifications(user.id, filter === 'unread');
  }

  /**
   * PATCH /notification/read-all
   *
   * Marks all notifications for the logged-in patient as read.
   */
  @Patch('read-all')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@GetUser() user: { id: string }) {
    return this.notificationService.markAllAsRead(user.id);
  }

  /**
   * PATCH /notification/:id/read
   *
   * Marks a single notification as read.
   */
  @Patch(':id/read')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.markAsRead(notificationId, user.id);
  }

  /**
   * DELETE /notification/:id
   *
   * Deletes a single notification for the logged-in patient.
   */
  @Delete(':id')
  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  async deleteNotification(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.deleteNotification(notificationId, user.id);
  }
}
