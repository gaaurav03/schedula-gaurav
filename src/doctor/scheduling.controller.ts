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
   * Create a stream schedule → server auto-generates all time slots.
   * ✅ DOCTOR only | ❌ Invalid config → 400 | ❌ No profile → 404
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
   * List all stream schedules with their generated slots.
   */
  @Get('stream')
  findAllStreamSchedules(@GetUser() user: { id: string }) {
    return this.schedulingService.findAllStreamSchedules(user.id);
  }

  /**
   * GET /doctor/schedule/stream/:id/slots
   * View all generated slots for a specific schedule.
   */
  @Get('stream/:id/slots')
  getStreamSlots(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedulingService.getStreamSlots(user.id, id);
  }

  /**
   * POST /doctor/schedule/wave
   * Create a wave schedule with a time window and max patient capacity.
   * ✅ DOCTOR only | ❌ Invalid time range → 400
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
   * List all wave schedules with booking counts.
   */
  @Get('wave')
  findAllWaveSchedules(@GetUser() user: { id: string }) {
    return this.schedulingService.findAllWaveSchedules(user.id);
  }
}
