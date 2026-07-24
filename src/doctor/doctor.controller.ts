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
import { DoctorService } from './doctor.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  /**
   * POST /doctor/profile
   * Create the doctor's onboarding profile.
   * ✅ DOCTOR only  |  ❌ PATIENT → 403  |  ❌ No token → 401
   * ❌ Duplicate → 409 Conflict
   */
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  createProfile(
    @GetUser() user: { id: string; role: Role },
    @Body() dto: CreateDoctorProfileDto,
  ) {
    return this.doctorService.create(user.id, dto);
  }

  /**
   * GET /doctor/profile
   * Retrieve the authenticated doctor's profile.
   * ✅ DOCTOR only  |  ❌ PATIENT → 403  |  ❌ No token → 401
   * ❌ Profile not created yet → 404 Not Found
   */
  @Get('profile')
  getProfile(@GetUser() user: { id: string; role: Role }) {
    return this.doctorService.findByUserId(user.id);
  }

  /**
   * PATCH /doctor/profile
   * Partially update the authenticated doctor's profile.
   * ✅ DOCTOR only  |  ❌ PATIENT → 403  |  ❌ No token → 401
   * ❌ Profile not created yet → 404 Not Found
   */
  @Patch('profile')
  updateProfile(
    @GetUser() user: { id: string; role: Role },
    @Body() dto: UpdateDoctorProfileDto,
  ) {
    return this.doctorService.update(user.id, dto);
  }
}
