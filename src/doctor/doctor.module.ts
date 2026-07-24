import { Module } from '@nestjs/common';
import { DoctorController } from './doctor.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DoctorController],
})
export class DoctorModule {}
