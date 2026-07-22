import { PartialType } from '@nestjs/mapped-types';
import { CreatePatientProfileDto } from './create-patient-profile.dto';

/**
 * UpdatePatientProfileDto extends CreatePatientProfileDto with all fields optional.
 * This allows partial updates (PATCH) — the client only sends fields they want to change.
 */
export class UpdatePatientProfileDto extends PartialType(CreatePatientProfileDto) {}
