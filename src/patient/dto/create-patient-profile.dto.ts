import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsEnum,
  IsOptional,
  IsPositive,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Gender } from '../entities/patient-profile.entity';

export class CreatePatientProfileDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString()
  @MaxLength(100)
  fullName: string;

  @IsInt({ message: 'Age must be a whole number' })
  @IsPositive({ message: 'Age must be positive' })
  @Min(1)
  @Max(150)
  age: number;

  @IsEnum(Gender, { message: 'Gender must be MALE, FEMALE, or OTHER' })
  gender: Gender;

  @IsNotEmpty({ message: 'Contact number is required' })
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+\-\s()]{7,20}$/, { message: 'Invalid contact number format' })
  contactNumber: string;

  // Optional fields
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  medicalHistory?: string;

  @IsOptional()
  @IsString()
  allergies?: string;
}
