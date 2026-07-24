import { IsInt, IsNotEmpty, IsOptional, IsPositive, Matches, Max, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CreateStreamScheduleDto {
  @IsNotEmpty({ message: 'date is required' })
  @Matches(DATE_REGEX, { message: 'date must be in YYYY-MM-DD format' })
  date: string;

  @IsNotEmpty({ message: 'startTime is required' })
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format (e.g. "10:00")' })
  startTime: string;

  @IsNotEmpty({ message: 'endTime is required' })
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format (e.g. "11:00")' })
  endTime: string;

  /** Duration of each appointment slot in minutes. Minimum 5 minutes. */
  @IsInt({ message: 'slotDurationMins must be an integer' })
  @IsPositive({ message: 'slotDurationMins must be positive' })
  @Min(5, { message: 'slotDurationMins must be at least 5 minutes' })
  @Max(480, { message: 'slotDurationMins cannot exceed 480 minutes (8 hours)' })
  slotDurationMins: number;

  /** Optional buffer/gap time between slots in minutes. Defaults to 0. */
  @IsOptional()
  @IsInt({ message: 'bufferTimeMins must be an integer' })
  @Min(0, { message: 'bufferTimeMins cannot be negative' })
  @Max(120, { message: 'bufferTimeMins cannot exceed 120 minutes' })
  bufferTimeMins?: number;
}
