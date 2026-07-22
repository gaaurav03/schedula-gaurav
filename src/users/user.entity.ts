import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { DoctorProfile } from '../doctor/entities/doctor-profile.entity';
import { PatientProfile } from '../patient/entities/patient-profile.entity';

export enum Role {
  DOCTOR = 'DOCTOR',
  PATIENT = 'PATIENT',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({
    type: 'enum',
    enum: Role,
  })
  role: Role;

  /** Inverse side of the OneToOne relation with DoctorProfile */
  @OneToOne(() => DoctorProfile, (doctorProfile) => doctorProfile.user)
  doctorProfile: DoctorProfile;

  /** Inverse side of the OneToOne relation with PatientProfile */
  @OneToOne(() => PatientProfile, (patientProfile) => patientProfile.user)
  patientProfile: PatientProfile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
