import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { RecurringAvailability } from './entities/recurring-availability.entity';
import { CustomAvailability } from './entities/custom-availability.entity';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorProfile, RecurringAvailability, CustomAvailability]),
    AuthModule,
  ],
  controllers: [DoctorController, AvailabilityController],
  providers: [DoctorService, AvailabilityService],
})
export class DoctorModule {}
