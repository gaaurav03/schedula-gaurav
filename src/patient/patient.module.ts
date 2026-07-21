import { Module } from '@nestjs/common';
import { PatientController } from './patient.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PatientController],
})
export class PatientModule {}
