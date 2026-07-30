import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsPositive,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateDoctorProfileDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString()
  @MaxLength(100)
  fullName: string;

  @IsNotEmpty({ message: 'Specialization is required' })
  @IsString()
  @MaxLength(100)
  specialization: string;

  @IsInt({ message: 'Experience must be a whole number' })
  @IsPositive({ message: 'Experience must be a positive number' })
  @Min(0)
  @Max(60)
  experienceYears: number;

  @IsNotEmpty({ message: 'Qualification is required' })
  @IsString()
  @MaxLength(200)
  qualification: string;

  @IsOptional()
  @IsString()
  profileDetails?: string;
}
