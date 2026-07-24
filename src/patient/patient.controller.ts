import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../users/user.entity';
import { PatientService } from './patient.service';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@Controller('patient')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  /**
   * POST /patient/profile
   * Create the patient's onboarding profile.
   * ✅ PATIENT only  |  ❌ DOCTOR → 403  |  ❌ No token → 401
   * ❌ Duplicate → 409 Conflict
   */
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  createProfile(
    @GetUser() user: { id: string; role: Role },
    @Body() dto: CreatePatientProfileDto,
  ) {
    return this.patientService.create(user.id, dto);
  }

  /**
   * GET /patient/profile
   * Retrieve the authenticated patient's profile.
   * ✅ PATIENT only  |  ❌ DOCTOR → 403  |  ❌ No token → 401
   * ❌ Profile not created yet → 404 Not Found
   */
  @Get('profile')
  getProfile(@GetUser() user: { id: string; role: Role }) {
    return this.patientService.findByUserId(user.id);
  }

  /**
   * PATCH /patient/profile
   * Partially update the authenticated patient's profile.
   * ✅ PATIENT only  |  ❌ DOCTOR → 403  |  ❌ No token → 401
   * ❌ Profile not created yet → 404 Not Found
   */
  @Patch('profile')
  updateProfile(
    @GetUser() user: { id: string; role: Role },
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientService.update(user.id, dto);
  }
}
