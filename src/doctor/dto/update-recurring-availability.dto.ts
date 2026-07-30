import { IsEnum, IsInt, IsOptional, IsPositive, Matches, Max, Min, ValidateIf } from 'class-validator';
import { DayOfWeek, SchedulingMode } from '../entities/recurring-availability.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateRecurringAvailabilityDto {
  @IsOptional()
  @IsEnum(DayOfWeek, {
    message: 'dayOfWeek must be one of: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY',
  })
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format (e.g. "09:00")' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format (e.g. "12:00")' })
  endTime?: string;

  @IsOptional()
  @IsEnum(SchedulingMode, { message: 'schedulingMode must be STREAM or WAVE' })
  schedulingMode?: SchedulingMode;

  @IsOptional()
  @ValidateIf((o) => o.schedulingMode === SchedulingMode.STREAM)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(500)
  maxPatients?: number;

  @IsOptional()
  @ValidateIf((o) => o.schedulingMode === SchedulingMode.WAVE)
  @IsInt()
  @IsPositive()
  @Min(5)
  @Max(480)
  slotDurationMins?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferTimeMins?: number;
}
