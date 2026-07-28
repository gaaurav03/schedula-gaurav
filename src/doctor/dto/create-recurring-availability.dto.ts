import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { DayOfWeek, SchedulingMode } from '../entities/recurring-availability.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateRecurringAvailabilityDto {
  @IsEnum(DayOfWeek, {
    message: 'dayOfWeek must be one of: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY',
  })
  dayOfWeek: DayOfWeek;

  @IsNotEmpty({ message: 'startTime is required' })
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format (e.g. "09:00")' })
  startTime: string;

  @IsNotEmpty({ message: 'endTime is required' })
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format (e.g. "12:00")' })
  endTime: string;

  /** How to schedule appointments in this recurring window */
  @IsEnum(SchedulingMode, { message: 'schedulingMode must be STREAM or WAVE' })
  schedulingMode: SchedulingMode;

  /**
   * STREAM mode: max patients (tokens) per session.
   * Required when schedulingMode = STREAM.
   */
  @ValidateIf((o) => o.schedulingMode === SchedulingMode.STREAM)
  @IsInt({ message: 'maxPatients must be an integer' })
  @IsPositive({ message: 'maxPatients must be positive' })
  @Min(1, { message: 'maxPatients must be at least 1' })
  @Max(500, { message: 'maxPatients cannot exceed 500' })
  maxPatients?: number;

  /**
   * WAVE mode: duration of each exact time slot in minutes.
   * Required when schedulingMode = WAVE.
   */
  @ValidateIf((o) => o.schedulingMode === SchedulingMode.WAVE)
  @IsInt({ message: 'slotDurationMins must be an integer' })
  @IsPositive({ message: 'slotDurationMins must be positive' })
  @Min(5, { message: 'slotDurationMins must be at least 5 minutes' })
  @Max(480, { message: 'slotDurationMins cannot exceed 480 minutes' })
  slotDurationMins?: number;

  /**
   * WAVE mode: gap/buffer between slots in minutes. Defaults to 0.
   * Optional when schedulingMode = WAVE.
   */
  @ValidateIf((o) => o.schedulingMode === SchedulingMode.WAVE)
  @IsOptional()
  @IsInt({ message: 'bufferTimeMins must be an integer' })
  @Min(0, { message: 'bufferTimeMins cannot be negative' })
  @Max(120, { message: 'bufferTimeMins cannot exceed 120 minutes' })
  bufferTimeMins?: number;
}
