import { IsNotEmpty, IsUUID, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class CreateAppointmentDto {
  /** Doctor's profile UUID (from GET /patient/schedule/available response) */
  @IsUUID('4', { message: 'doctorId must be a valid UUID' })
  doctorId: string;

  /** Appointment date in YYYY-MM-DD format */
  @IsNotEmpty({ message: 'date is required' })
  @Matches(DATE_REGEX, { message: 'date must be in YYYY-MM-DD format (e.g. "2026-06-20")' })
  date: string;

  /**
   * Start time of the slot/session in HH:mm format.
   * For WAVE: exact slot start (e.g. "10:00")
   * For STREAM: session window start (e.g. "09:00")
   */
  @IsNotEmpty({ message: 'startTime is required' })
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:mm format (e.g. "10:00")' })
  startTime: string;

  /**
   * End time of the slot/session in HH:mm format.
   * For WAVE: exact slot end (e.g. "10:15")
   * For STREAM: session window end (e.g. "13:00")
   */
  @IsNotEmpty({ message: 'endTime is required' })
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:mm format (e.g. "10:15")' })
  endTime: string;
}
