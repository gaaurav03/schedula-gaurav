import { IsBoolean, IsNotEmpty, IsOptional, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CreateCustomAvailabilityDto {
  @IsNotEmpty({ message: 'date is required' })
  @Matches(DATE_REGEX, {
    message: 'date must be in YYYY-MM-DD format (e.g. "2026-06-15")',
  })
  date: string;

  @IsNotEmpty({ message: 'startTime is required' })
  @Matches(TIME_REGEX, {
    message: 'startTime must be in HH:mm format (e.g. "14:00")',
  })
  startTime: string;

  @IsNotEmpty({ message: 'endTime is required' })
  @Matches(TIME_REGEX, {
    message: 'endTime must be in HH:mm format (e.g. "15:00")',
  })
  endTime: string;

  /**
   * Optional. Defaults to true.
   * Set to false to mark the doctor as completely unavailable for this date
   * (overrides any recurring slots for that weekday).
   */
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
