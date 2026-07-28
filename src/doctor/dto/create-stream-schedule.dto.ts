import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPositive,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SchedulingType } from '../entities/stream-schedule.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * DTO for creating a STREAM schedule.
 * STREAM = Token-based: doctor defines a time window + max patients.
 * Each patient who books receives a sequential token number.
 */
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

  /** Maximum number of patients (tokens) allowed in this stream session */
  @IsInt({ message: 'maxPatients must be an integer' })
  @IsPositive({ message: 'maxPatients must be positive' })
  @Min(1, { message: 'maxPatients must be at least 1' })
  @Max(500, { message: 'maxPatients cannot exceed 500' })
  maxPatients: number;

  /**
   * Indicates whether this schedule is based on the doctor's
   * RECURRING weekly availability or a CUSTOM date-specific override.
   */
  @IsEnum(SchedulingType, { message: 'schedulingType must be RECURRING or CUSTOM' })
  schedulingType: SchedulingType;
}
