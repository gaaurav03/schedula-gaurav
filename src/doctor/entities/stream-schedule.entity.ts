import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { DoctorProfile } from './doctor-profile.entity';
import { StreamSlot } from './stream-slot.entity';

@Entity('stream_schedules')
export class StreamSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ManyToOne: one doctor can have many stream schedules.
   * CASCADE DELETE removes schedules when doctor profile is deleted.
   */
  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  /** Specific date for this schedule: "YYYY-MM-DD" */
  @Column({ type: 'date' })
  date: string;

  /** 24-hour "HH:mm" format */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** 24-hour "HH:mm" format */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /** Duration of each slot in minutes (e.g. 15) */
  @Column({ type: 'int' })
  slotDurationMins: number;

  /** Optional gap between slots in minutes (e.g. 5) — defaults to 0 */
  @Column({ type: 'int', default: 0 })
  bufferTimeMins: number;

  /** Auto-generated slots linked to this schedule */
  @OneToMany(() => StreamSlot, (slot) => slot.schedule, { cascade: true })
  slots: StreamSlot[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
