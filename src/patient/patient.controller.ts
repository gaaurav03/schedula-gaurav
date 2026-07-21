import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../users/user.entity';

@Controller('patient')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientController {
  /**
   * GET /patient/profile
   * Protected route – only accessible by users with role PATIENT.
   *
   * ✅ Patient can access
   * ❌ Doctor receives 403 Forbidden
   * ❌ Unauthenticated request receives 401 Unauthorized
   */
  @Get('profile')
  @Roles(Role.PATIENT)
  getProfile(@GetUser() user: { id: string; name: string; email: string; role: Role }) {
    return {
      message: 'Welcome to the Patient portal!',
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        portalAccess: 'Patient Dashboard – view appointments, prescriptions, and medical history.',
      },
    };
  }
}
