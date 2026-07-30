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

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export enum SchedulingMode {
  STREAM = 'STREAM',
  WAVE = 'WAVE',
}

@Entity('recurring_availability')
export class RecurringAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ManyToOne relation: one doctor can have many recurring slots.
   * CASCADE DELETE ensures slots are removed when the doctor profile is deleted.
   */
  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  @Column({ type: 'enum', enum: DayOfWeek })
  dayOfWeek: DayOfWeek;

  /** 24-hour format: "HH:mm" e.g. "10:00", "13:30" */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** 24-hour format: "HH:mm" e.g. "13:00", "17:00" */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /**
   * How appointments are scheduled within this time window:
   * STREAM = token-based queue (patients get sequential token numbers)
   * WAVE   = exact time slots (server auto-divides window into slots)
   */
  @Column({ type: 'enum', enum: SchedulingMode, default: SchedulingMode.STREAM })
  schedulingMode: SchedulingMode;

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
