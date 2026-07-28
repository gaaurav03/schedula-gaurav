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
   * View STREAM sessions for a doctor on a date.
   * Response includes schedulingType (RECURRING | CUSTOM) and token availability.
   * ✅ PATIENT only | ❌ DOCTOR → 403
   */
  @Get('stream')
  getStreamSchedules(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.patientSchedulingService.getStreamSchedules(doctorId, date);
  }

  /**
   * POST /patient/schedule/stream/:streamId/book
   * Book into a STREAM session → receive a sequential token number.
   * ❌ Session full → 409 | ❌ Duplicate booking → 409 | ❌ Not found → 404
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
   * GET /patient/schedule/wave?doctorId=&date=YYYY-MM-DD
   * View available exact time slots (Wave slots) for a doctor on a date.
   * Response includes schedulingType (RECURRING | CUSTOM) per slot.
   */
  @Get('wave')
  getAvailableWaveSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.patientSchedulingService.getAvailableWaveSlots(doctorId, date);
  }

  /**
   * POST /patient/schedule/wave/:slotId/book
   * Book an exact Wave time slot → receive confirmed appointment time.
   * ❌ Slot taken → 409 | ❌ Duplicate booking → 409 | ❌ Not found → 404
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
