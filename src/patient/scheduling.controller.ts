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
   * POST /patient/schedule/stream/:streamId/book
   *
   * Book a token in a STREAM session.
   * Use the streamId returned from GET /patient/schedule/available.
   * ❌ Session full → 409 | ❌ Duplicate booking → 409 | ❌ Not found → 404
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
   * Book an exact WAVE time slot.
   * Use the slotId from availableSlots[] in GET /patient/schedule/available.
   * ❌ Slot taken → 409 | ❌ Duplicate booking → 409 | ❌ Not found → 404
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
