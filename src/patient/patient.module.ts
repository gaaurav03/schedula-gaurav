import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientProfile } from './entities/patient-profile.entity';
import { PatientSchedulingController } from './scheduling.controller';
import { PatientSchedulingService } from './scheduling.service';
import { StreamSlot } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveBooking } from '../doctor/entities/wave-booking.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PatientProfile,
      StreamSlot,
      WaveSchedule,
      WaveBooking,
    ]),
    AuthModule,
  ],
  controllers: [PatientController, PatientSchedulingController],
  providers: [PatientService, PatientSchedulingService],
})
export class PatientModule {}
