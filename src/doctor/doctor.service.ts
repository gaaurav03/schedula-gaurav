import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

@Injectable()
export class DoctorService {
  constructor(
    @InjectRepository(DoctorProfile)
    private readonly doctorProfileRepository: Repository<DoctorProfile>,
  ) {}

  /**
   * Create a new doctor profile.
   * Throws ConflictException if the user already has a profile (duplicate prevention).
   */
  async create(userId: string, dto: CreateDoctorProfileDto): Promise<DoctorProfile> {
    const existing = await this.doctorProfileRepository.findOne({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException(
        'Doctor profile already exists. Use PATCH /doctor/profile to update it.',
      );
    }

    const profile = this.doctorProfileRepository.create({
      ...dto,
      userId,
    });

    return this.doctorProfileRepository.save(profile);
  }

  /**
   * Get the doctor profile for the authenticated user.
   * Throws NotFoundException if no profile exists yet.
   */
  async findByUserId(userId: string): Promise<DoctorProfile> {
    const profile = await this.doctorProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(
        'Doctor profile not found. Please complete onboarding via POST /doctor/profile.',
      );
    }

    return profile;
  }

  /**
   * Update the doctor profile for the authenticated user.
   * Throws NotFoundException if no profile exists yet.
   */
  async update(userId: string, dto: UpdateDoctorProfileDto): Promise<DoctorProfile> {
    const profile = await this.findByUserId(userId);

    Object.assign(profile, dto);

    return this.doctorProfileRepository.save(profile);
  }
}
