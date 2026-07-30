import {
  IsBoolean,
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
import { SchedulingMode } from '../entities/recurring-availability.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CreateCustomAvailabilityDto {
  @IsNotEmpty({ message: 'date is required' })
  @Matches(DATE_REGEX, { message: 'date must be in YYYY-MM-DD format (e.g. "2026-06-15")' })
  date: string;

  @IsNotEmpty({ message: 'startTime is required' })
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format (e.g. "14:00")' })
  startTime: string;

  @IsNotEmpty({ message: 'endTime is required' })
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format (e.g. "15:00")' })
  endTime: string;

  /**
   * Optional. Defaults to true.
   * Set to false to mark the doctor as completely unavailable on this date.
   * When false, schedulingMode and related fields are NOT required.
   */
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  /**
   * How to schedule appointments in this custom window.
   * Required when isAvailable = true (or not provided).
   */
  @ValidateIf((o) => o.isAvailable !== false)
  @IsEnum(SchedulingMode, { message: 'schedulingMode must be STREAM or WAVE' })
  schedulingMode?: SchedulingMode;

  /**
   * STREAM mode: max patients (tokens) per session.
   * Required when schedulingMode = STREAM and isAvailable = true.
   */
  @ValidateIf((o) => o.isAvailable !== false && o.schedulingMode === SchedulingMode.STREAM)
  @IsInt({ message: 'maxPatients must be an integer' })
  @IsPositive({ message: 'maxPatients must be positive' })
  @Min(1, { message: 'maxPatients must be at least 1' })
  @Max(500, { message: 'maxPatients cannot exceed 500' })
  maxPatients?: number;

  /**
   * WAVE mode: duration of each exact time slot in minutes.
   * Required when schedulingMode = WAVE and isAvailable = true.
   */
  @ValidateIf((o) => o.isAvailable !== false && o.schedulingMode === SchedulingMode.WAVE)
  @IsInt({ message: 'slotDurationMins must be an integer' })
  @IsPositive({ message: 'slotDurationMins must be positive' })
  @Min(5, { message: 'slotDurationMins must be at least 5 minutes' })
  @Max(480, { message: 'slotDurationMins cannot exceed 480 minutes' })
  slotDurationMins?: number;

  /**
   * WAVE mode: gap/buffer between slots in minutes. Defaults to 0.
   */
  @ValidateIf((o) => o.isAvailable !== false && o.schedulingMode === SchedulingMode.WAVE)
  @IsOptional()
  @IsInt({ message: 'bufferTimeMins must be an integer' })
  @Min(0, { message: 'bufferTimeMins cannot be negative' })
  @Max(120, { message: 'bufferTimeMins cannot exceed 120 minutes' })
  bufferTimeMins?: number;
}
