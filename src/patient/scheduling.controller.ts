import {
  Controller,
  Get,
  Post,
  Body,
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
import { PatientSchedulingService } from './scheduling.service';
import { BookScheduleDto } from './dto/book-schedule.dto';

@Controller('patient/schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class PatientSchedulingController {
  constructor(private readonly patientSchedulingService: PatientSchedulingService) {}

  /**
   * GET /patient/schedule/available?doctorId=&date=YYYY-MM-DD
   *
   * THE unified endpoint — returns ALL bookable sessions for a doctor on a date.
   * Includes both directly-created stream/wave sessions AND
   * template-driven sessions (custom overrides + recurring availability).
   *
   * Response contains both STREAM sessions (with streamId to book)
   * and WAVE sessions (with individual slotIds to book).
   * ✅ PATIENT only
   */
  @Get('available')
  getAvailableSchedule(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.patientSchedulingService.getAvailableSchedule(doctorId, date);
  }

  /**
   * POST /patient/schedule/book
   *
   * Unified booking endpoint — works for both WAVE slots and STREAM sessions.
   * Patient provides a single targetId from GET /patient/schedule/available:
   *   - WAVE:   use availableSlots[].id
   *   - STREAM: use sessions[].streamId
   *
   * The system auto-detects whether the targetId is a WaveSlot or StreamSchedule
   * and books accordingly — no need to know the type in advance.
   *
   * Body: { "targetId": "<uuid>" }
   * ✅ PATIENT only
   */
  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  bookUnified(
    @GetUser() user: { id: string },
    @Body() dto: BookScheduleDto,
  ) {
    return this.patientSchedulingService.bookUnified(user.id, dto.targetId);
  }

  /**
   * POST /patient/schedule/stream/:streamId/book
   *
   * [Legacy] Book a token in a STREAM session directly.
   * Prefer using POST /patient/schedule/book instead.
   * ✅ PATIENT only
   */
  @Post('stream/:streamId/book')
  @HttpCode(HttpStatus.CREATED)
  bookStream(
    @GetUser() user: { id: string },
    @Param('streamId', ParseUUIDPipe) streamId: string,
  ) {
    return this.patientSchedulingService.bookStream(user.id, streamId);
  }

  /**
   * POST /patient/schedule/wave/:slotId/book
   *
   * [Legacy] Book an exact WAVE time slot directly.
   * Prefer using POST /patient/schedule/book instead.
   * ✅ PATIENT only
   */
  @Post('wave/:slotId/book')
  @HttpCode(HttpStatus.CREATED)
  bookWaveSlot(
    @GetUser() user: { id: string },
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    return this.patientSchedulingService.bookWaveSlot(user.id, slotId);
  }
}
