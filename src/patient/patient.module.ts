import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientProfile } from './entities/patient-profile.entity';
import { PatientSchedulingController } from './scheduling.controller';
import { PatientSchedulingService } from './scheduling.service';
import { StreamSchedule } from '../doctor/entities/stream-schedule.entity';
import { StreamBooking } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveSlot } from '../doctor/entities/wave-booking.entity';
import { RecurringAvailability } from '../doctor/entities/recurring-availability.entity';
import { CustomAvailability } from '../doctor/entities/custom-availability.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PatientProfile,
      StreamSchedule,
      StreamBooking,
      WaveSchedule,
      WaveSlot,
      RecurringAvailability, // needed for smart availability resolver
      CustomAvailability,    // needed for smart availability resolver
    ]),
    AuthModule,
  ],
  controllers: [PatientController, PatientSchedulingController],
  providers: [PatientService, PatientSchedulingService],
})
export class PatientModule {}
