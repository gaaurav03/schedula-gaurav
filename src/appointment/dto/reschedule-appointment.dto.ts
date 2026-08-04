import { IsDateString, IsString, Matches, IsOptional, MaxLength } from 'class-validator';

export class RescheduleAppointmentDto {
  /**
   * New appointment date in YYYY-MM-DD format.
   * @example "2026-08-15"
   */
  @IsDateString({}, { message: 'newDate must be a valid date string in YYYY-MM-DD format.' })
  newDate: string;

  /**
   * New appointment start time in HH:mm format.
   * @example "10:30"
   */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'newStartTime must be in HH:mm format (e.g. 10:30).' })
  newStartTime: string;

  /**
   * New appointment end time in HH:mm format.
   * @example "10:45"
   */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'newEndTime must be in HH:mm format (e.g. 10:45).' })
  newEndTime: string;

  /**
   * Optional patient-provided reason for rescheduling (stored for audit).
   * @example "Conflict with work meeting"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
