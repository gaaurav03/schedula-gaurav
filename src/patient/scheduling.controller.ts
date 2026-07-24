import {
  Controller,
  Get,
  Post,
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

@Controller('patient/schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class PatientSchedulingController {
  constructor(private readonly patientSchedulingService: PatientSchedulingService) {}

  /**
   * GET /patient/schedule/stream?doctorId=&date=YYYY-MM-DD
   * View available (unbooked) stream slots for a doctor on a specific date.
   * ✅ PATIENT only | ❌ DOCTOR → 403
   */
  @Get('stream')
  getAvailableStreamSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.patientSchedulingService.getAvailableStreamSlots(doctorId, date);
  }

  /**
   * POST /patient/schedule/stream/:slotId/book
   * Book an exact stream slot → returns confirmed appointment time.
   * ❌ Already booked → 409 | ❌ Slot not found → 404
   */
  @Post('stream/:slotId/book')
  @HttpCode(HttpStatus.CREATED)
  bookStreamSlot(
    @GetUser() user: { id: string },
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ) {
    return this.patientSchedulingService.bookStreamSlot(user.id, slotId);
  }

  /**
   * GET /patient/schedule/wave?doctorId=&date=YYYY-MM-DD
   * View wave schedules for a doctor on a specific date.
   * Shows availability: "3/5" slots remaining.
   */
  @Get('wave')
  getWaveSchedules(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.patientSchedulingService.getWaveSchedules(doctorId, date);
  }

  /**
   * POST /patient/schedule/wave/:waveId/book
   * Book into a wave → receive assigned token number.
   * ❌ Wave full → 409 | ❌ Duplicate booking → 409 | ❌ Not found → 404
   */
  @Post('wave/:waveId/book')
  @HttpCode(HttpStatus.CREATED)
  bookWaveSlot(
    @GetUser() user: { id: string },
    @Param('waveId', ParseUUIDPipe) waveId: string,
  ) {
    return this.patientSchedulingService.bookWaveSlot(user.id, waveId);
  }
}
