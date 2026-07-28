import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

// ─── Patient Routes: /appointment/* ──────────────────────────────────────────

@Controller('appointment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  /**
   * POST /appointment
   *
   * Book an appointment with a doctor for a specific date and time slot.
   * Payload: { doctorId, date, startTime, endTime }
   *
   * - System checks WAVE slots first, then STREAM sessions
   * - Future date/time enforced
   * - Duplicate booking prevented
   * - Session capacity enforced for STREAM
   * - ✅ PATIENT only
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  bookAppointment(
    @GetUser() user: { id: string },
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentService.bookAppointment(user.id, dto);
  }

  /**
   * GET /appointment/my
   *
   * View all appointments for the logged-in patient.
   * Returns: doctor details, date, slot timing, status, token number (if STREAM).
   * ✅ PATIENT only
   */
  @Get('my')
  getMyAppointments(@GetUser() user: { id: string }) {
    return this.appointmentService.getMyAppointments(user.id);
  }

  /**
   * PATCH /appointment/:id/cancel
   *
   * Cancel an active appointment.
   * - Only appointment owner can cancel
   * - Cannot cancel already cancelled appointments
   * - Cannot cancel past appointments
   * - Slot is freed/rolled back automatically
   * ✅ PATIENT only
   */
  @Patch(':id/cancel')
  cancelAppointment(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointmentService.cancelAppointment(user.id, id);
  }
}

// ─── Doctor Routes: /doctor/appointments ─────────────────────────────────────

@Controller('doctor/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class DoctorAppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  /**
   * GET /doctor/appointments?status=BOOKED&date=YYYY-MM-DD
   *
   * View all appointments booked with the logged-in doctor.
   * Optional filters:
   *   - ?status=BOOKED|CANCELLED
   *   - ?date=YYYY-MM-DD
   *
   * Returns: patient details, appointment date, slot timing, status, token number.
   * ✅ DOCTOR only
   */
  @Get()
  getDoctorAppointments(
    @GetUser() user: { id: string },
    @Query('status') status?: string,
    @Query('date') date?: string,
  ) {
    return this.appointmentService.getDoctorAppointments(user.id, status, date);
  }
}
