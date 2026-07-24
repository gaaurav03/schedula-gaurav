import { PartialType } from '@nestjs/mapped-types';
import { CreateDoctorProfileDto } from './create-doctor-profile.dto';

/**
 * UpdateDoctorProfileDto extends CreateDoctorProfileDto with all fields optional.
 * This allows partial updates (PATCH) — the client only sends fields they want to change.
 */
export class UpdateDoctorProfileDto extends PartialType(CreateDoctorProfileDto) {}
