import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorProfile]),
    AuthModule,
  ],
  controllers: [DoctorController],
  providers: [DoctorService],
})
export class DoctorModule {}
