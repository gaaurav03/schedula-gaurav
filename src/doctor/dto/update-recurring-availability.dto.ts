import { PartialType } from '@nestjs/mapped-types';
import { CreateRecurringAvailabilityDto } from './create-recurring-availability.dto';

/**
 * All fields optional for PATCH updates.
 */
export class UpdateRecurringAvailabilityDto extends PartialType(
  CreateRecurringAvailabilityDto,
) {}
