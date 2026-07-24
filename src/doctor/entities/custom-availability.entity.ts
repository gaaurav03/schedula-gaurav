import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DoctorProfile } from './doctor-profile.entity';

@Entity('custom_availability')
export class CustomAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ManyToOne relation: one doctor can have many custom date overrides.
   * CASCADE DELETE ensures overrides are removed when the doctor profile is deleted.
   */
  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  /** Specific date in "YYYY-MM-DD" format — overrides recurring for this day */
  @Column({ type: 'date' })
  date: string;

  /** 24-hour format: "HH:mm" e.g. "14:00" */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** 24-hour format: "HH:mm" e.g. "15:00" */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /**
   * Set to false to mark the doctor as completely unavailable on this date
   * (even if there are recurring slots for that weekday).
   */
  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
