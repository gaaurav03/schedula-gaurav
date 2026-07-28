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
import { SchedulingMode } from './recurring-availability.entity';

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

  /**
   * How appointments are scheduled within this time window:
   * STREAM = token-based queue | WAVE = exact time slots
   * Ignored when isAvailable = false.
   */
  @Column({ type: 'enum', enum: SchedulingMode, nullable: true })
  schedulingMode: SchedulingMode | null;

  /** STREAM only: maximum number of tokens per session */
  @Column({ type: 'int', nullable: true })
  maxPatients: number | null;

  /** WAVE only: duration of each generated slot in minutes */
  @Column({ type: 'int', nullable: true })
  slotDurationMins: number | null;

  /** WAVE only: buffer/gap between slots in minutes (default 0) */
  @Column({ type: 'int', nullable: true, default: 0 })
  bufferTimeMins: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
