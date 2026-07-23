import { IsEnum, IsNotEmpty, Matches } from 'class-validator';
import { DayOfWeek } from '../entities/recurring-availability.entity';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateRecurringAvailabilityDto {
  @IsEnum(DayOfWeek, {
    message: 'dayOfWeek must be one of: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY',
  })
  dayOfWeek: DayOfWeek;

  @IsNotEmpty({ message: 'startTime is required' })
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format (e.g. "09:00", "14:30")' })
  startTime: string;

  @IsNotEmpty({ message: 'endTime is required' })
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format (e.g. "13:00", "17:00")' })
  endTime: string;
}
