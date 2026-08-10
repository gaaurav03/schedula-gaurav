import {
  Controller,
  Get,
  Patch,
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

@Controller('notification')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

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
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notificationService.markAsRead(notificationId, user.id);
  }
}
