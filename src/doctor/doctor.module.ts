import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { RecurringAvailability } from './entities/recurring-availability.entity';
import { CustomAvailability } from './entities/custom-availability.entity';
import { StreamSchedule } from './entities/stream-schedule.entity';
import { StreamBooking } from './entities/stream-slot.entity';
import { WaveSchedule } from './entities/wave-schedule.entity';
import { WaveSlot } from './entities/wave-booking.entity';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DoctorProfile,
      RecurringAvailability,
      CustomAvailability,
      StreamSchedule,
      StreamBooking,
      WaveSchedule,
      WaveSlot,
    ]),
    AuthModule,
  ],
  controllers: [DoctorController, AvailabilityController, SchedulingController],
  providers: [DoctorService, AvailabilityService, SchedulingService],
  exports: [TypeOrmModule],
})
export class DoctorModule {}
