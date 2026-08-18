import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { ReminderService } from './reminder.service';
import { PatientProfile } from '../patient/entities/patient-profile.entity';
import { Appointment } from '../appointment/entities/appointment.entity';
import { DoctorProfile } from '../doctor/entities/doctor-profile.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      PatientProfile,
      Appointment,
      DoctorProfile,
    ]),
    AuthModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, ReminderService],
  exports: [NotificationService],
})
export class NotificationModule {}
