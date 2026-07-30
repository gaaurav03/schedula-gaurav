import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DoctorProfile } from './doctor-profile.entity';
import { WaveSlot } from './wave-booking.entity';
import { SchedulingType } from './stream-schedule.entity';

/**
 * WAVE SCHEDULING: Exact time-slot model.
 * Doctor sets a time window + slot duration + optional buffer.
 * Server auto-generates individual bookable slots.
 * Ideal for: Psychologists, Dermatologists, Specialists.
 */
@Entity('wave_schedules')
export class WaveSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  /** Specific date for this schedule: "YYYY-MM-DD" */
  @Column({ type: 'date' })
  date: string;

  /** Session window start: "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** Session window end: "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /** Duration of each individual appointment slot in minutes (e.g. 15) */
  @Column({ type: 'int' })
  slotDurationMins: number;

  /** Optional gap/buffer between slots in minutes (default: 0) */
  @Column({ type: 'int', default: 0 })
  bufferTimeMins: number;

  /**
   * Whether this schedule is based on the doctor's RECURRING weekly template
   * or a CUSTOM date-specific override.
   */
  @Column({ type: 'enum', enum: SchedulingType })
  schedulingType: SchedulingType;

  @OneToMany(() => WaveSlot, (slot) => slot.wave, { cascade: true })
  slots: WaveSlot[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
