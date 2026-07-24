import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientProfile } from './entities/patient-profile.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PatientProfile]),
    AuthModule,
  ],
  controllers: [PatientController],
  providers: [PatientService],
})
export class PatientModule {}
