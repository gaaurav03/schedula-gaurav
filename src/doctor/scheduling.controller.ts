import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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
import { SchedulingService } from './scheduling.service';
import { CreateStreamScheduleDto } from './dto/create-stream-schedule.dto';
import { CreateWaveScheduleDto } from './dto/create-wave-schedule.dto';

@Controller('doctor/schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  /**
   * POST /doctor/schedule/stream
   * Create a STREAM session (token-based).
   * Doctor sets: time window + maxPatients + schedulingType (RECURRING | CUSTOM)
   * ✅ DOCTOR only | ❌ Invalid time range → 400 | ❌ No profile → 404
   */
  @Post('stream')
  @HttpCode(HttpStatus.CREATED)
  createStreamSchedule(
    @GetUser() user: { id: string },
    @Body() dto: CreateStreamScheduleDto,
  ) {
    return this.schedulingService.createStreamSchedule(user.id, dto);
  }

  /**
   * GET /doctor/schedule/stream
   * List all STREAM sessions with current token booking counts.
   */
  @Get('stream')
  findAllStreamSchedules(@GetUser() user: { id: string }) {
    return this.schedulingService.findAllStreamSchedules(user.id);
  }

  /**
   * GET /doctor/schedule/stream/:id/bookings
   * View all token bookings for a specific STREAM session.
   */
  @Get('stream/:id/bookings')
  getStreamBookings(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulingService.getStreamBookings(user.id, id);
  }

  /**
   * POST /doctor/schedule/wave
   * Create a WAVE schedule (exact slot-based).
   * Doctor sets: time window + slotDurationMins + bufferTimeMins? + schedulingType (RECURRING | CUSTOM)
   * Server auto-generates all individual time slots.
   * ✅ DOCTOR only | ❌ Invalid config → 400
   */
  @Post('wave')
  @HttpCode(HttpStatus.CREATED)
  createWaveSchedule(
    @GetUser() user: { id: string },
    @Body() dto: CreateWaveScheduleDto,
  ) {
    return this.schedulingService.createWaveSchedule(user.id, dto);
  }

  /**
   * GET /doctor/schedule/wave
   * List all WAVE schedules with auto-generated slots.
   */
  @Get('wave')
  findAllWaveSchedules(@GetUser() user: { id: string }) {
    return this.schedulingService.findAllWaveSchedules(user.id);
  }

  /**
   * GET /doctor/schedule/wave/:id/slots
   * View all auto-generated slots for a specific WAVE schedule.
   */
  @Get('wave/:id/slots')
  getWaveSlots(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulingService.getWaveSlots(user.id, id);
  }
}
