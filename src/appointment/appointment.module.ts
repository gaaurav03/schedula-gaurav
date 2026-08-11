import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity';
import { AppointmentService } from './appointment.service';
import { AppointmentController, DoctorAppointmentController } from './appointment.controller';
import { StreamSchedule } from '../doctor/entities/stream-schedule.entity';
import { StreamBooking } from '../doctor/entities/stream-slot.entity';
import { WaveSchedule } from '../doctor/entities/wave-schedule.entity';
import { WaveSlot } from '../doctor/entities/wave-booking.entity';
import { DoctorProfile } from '../doctor/entities/doctor-profile.entity';
import { PatientProfile } from '../patient/entities/patient-profile.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      StreamSchedule,
      StreamBooking,
      WaveSchedule,
      WaveSlot,
      DoctorProfile,
      PatientProfile,
    ]),
    AuthModule,
    NotificationModule,
  ],
  controllers: [AppointmentController, DoctorAppointmentController],
  providers: [AppointmentService],
})
export class AppointmentModule {}
