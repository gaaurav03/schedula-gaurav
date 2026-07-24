import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from '../users/user.entity';
import { AvailabilityService } from './availability.service';
import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';

@Controller('doctor/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * POST /doctor/availability
   * Create a recurring weekly availability slot.
   * ✅ DOCTOR only | ❌ Overlap → 409 | ❌ Invalid time range → 400
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createRecurring(
    @GetUser() user: { id: string },
    @Body() dto: CreateRecurringAvailabilityDto,
  ) {
    return this.availabilityService.createRecurring(user.id, dto);
  }

  /**
   * GET /doctor/availability
   * Get all recurring weekly slots for this doctor.
   */
  @Get()
  findAllRecurring(@GetUser() user: { id: string }) {
    return this.availabilityService.findAllRecurring(user.id);
  }

  /**
   * GET /doctor/availability/date?date=YYYY-MM-DD
   * Get effective availability for a specific date.
   * Returns custom override if it exists, otherwise falls back to recurring.
   *
   * NOTE: This route must be declared BEFORE /:id to avoid "date" being matched as a UUID.
   */
  @Get('date')
  getAvailabilityForDate(
    @GetUser() user: { id: string },
    @Query('date') date: string,
  ) {
    return this.availabilityService.getAvailabilityForDate(user.id, date);
  }

  /**
   * POST /doctor/availability/override
   * Create a custom date override slot.
   * ✅ DOCTOR only | ❌ Overlap → 409 | ❌ Invalid date/time → 400
   */
  @Post('override')
  @HttpCode(HttpStatus.CREATED)
  createOverride(
    @GetUser() user: { id: string },
    @Body() dto: CreateCustomAvailabilityDto,
  ) {
    return this.availabilityService.createOverride(user.id, dto);
  }

  /**
   * PATCH /doctor/availability/:id
   * Update a recurring slot by ID.
   * ❌ Wrong owner → 403 | ❌ Not found → 404 | ❌ Overlap → 409
   */
  @Patch(':id')
  updateRecurring(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringAvailabilityDto,
  ) {
    return this.availabilityService.updateRecurring(user.id, id, dto);
  }

  /**
   * DELETE /doctor/availability/:id
   * Delete a recurring slot by ID.
   * ❌ Wrong owner → 403 | ❌ Not found → 404
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteRecurring(
    @GetUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.availabilityService.deleteRecurring(user.id, id);
  }
}
