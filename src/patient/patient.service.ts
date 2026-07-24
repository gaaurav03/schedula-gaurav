import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientProfile } from './entities/patient-profile.entity';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(PatientProfile)
    private readonly patientProfileRepository: Repository<PatientProfile>,
  ) {}

  /**
   * Create a new patient profile.
   * Throws ConflictException if the user already has a profile (duplicate prevention).
   */
  async create(userId: string, dto: CreatePatientProfileDto): Promise<PatientProfile> {
    const existing = await this.patientProfileRepository.findOne({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException(
        'Patient profile already exists. Use PATCH /patient/profile to update it.',
      );
    }

    const profile = this.patientProfileRepository.create({
      ...dto,
      userId,
    });

    return this.patientProfileRepository.save(profile);
  }

  /**
   * Get the patient profile for the authenticated user.
   * Throws NotFoundException if no profile exists yet.
   */
  async findByUserId(userId: string): Promise<PatientProfile> {
    const profile = await this.patientProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(
        'Patient profile not found. Please complete onboarding via POST /patient/profile.',
      );
    }

    return profile;
  }

  /**
   * Update the patient profile for the authenticated user.
   * Throws NotFoundException if no profile exists yet.
   */
  async update(userId: string, dto: UpdatePatientProfileDto): Promise<PatientProfile> {
    const profile = await this.findByUserId(userId);

    Object.assign(profile, dto);

    return this.patientProfileRepository.save(profile);
  }
}
