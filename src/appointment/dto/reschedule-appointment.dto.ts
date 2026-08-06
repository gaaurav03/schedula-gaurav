import { IsDateString, IsString, Matches, IsOptional, MaxLength } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class RescheduleAppointmentDto {
  /**
   * New appointment date in YYYY-MM-DD format.
   * @example "2026-08-15"
   */
  @IsDateString({}, { message: 'newDate must be a valid date string in YYYY-MM-DD format.' })
  newDate: string;

  /**
   * New slot start time in HH:mm format.
   * @example "11:00"
   */
  @Matches(TIME_REGEX, { message: 'newStartTime must be in HH:mm format (e.g. "11:00").' })
  newStartTime: string;

  /**
   * New slot end time in HH:mm format.
   * @example "11:15"
   */
  @Matches(TIME_REGEX, { message: 'newEndTime must be in HH:mm format (e.g. "11:15").' })
  newEndTime: string;

  /**
   * Optional reason for the reschedule (stored for audit trail).
   * @example "Changed work schedule"
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
