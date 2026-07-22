import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

@Entity('patient_profiles')
export class PatientProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * OneToOne relation with the User entity.
   * Each patient user can have exactly one profile (enforced by UNIQUE constraint via migration).
   */
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'int' })
  age: number;

  @Column({
    type: 'enum',
    enum: Gender,
  })
  gender: Gender;

  @Column({ type: 'varchar', length: 20 })
  contactNumber: string;

  // Optional fields
  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  /** Basic Health Information – optional */
  @Column({ type: 'varchar', length: 10, nullable: true })
  bloodGroup: string | null;

  @Column({ type: 'text', nullable: true })
  medicalHistory: string | null;

  @Column({ type: 'text', nullable: true })
  allergies: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
