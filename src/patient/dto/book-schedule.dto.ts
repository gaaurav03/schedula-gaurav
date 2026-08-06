import { IsUUID } from 'class-validator';

export class BookScheduleDto {
  /**
   * The ID of the slot or session to book.
   * Can be either:
   *   - A WaveSlot ID  (from availableSlots[].id in GET /patient/schedule/available)
   *   - A StreamSchedule ID (from sessions[].streamId in GET /patient/schedule/available)
   *
   * The system auto-detects which type it is and books accordingly.
   */
  @IsUUID('4', { message: 'targetId must be a valid UUID.' })
  targetId: string;
}
