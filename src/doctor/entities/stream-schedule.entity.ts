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
import { StreamBooking } from './stream-slot.entity';

export enum SchedulingType {
  RECURRING = 'RECURRING',
  CUSTOM = 'CUSTOM',
}

/**
 * STREAM SCHEDULING: Token-based appointment model.
 * Doctor sets a time window + max patient capacity.
 * Patients queue up and receive sequential token numbers.
 * Ideal for: General Physicians, OPD Clinics, high-volume hospitals.
 */
@Entity('stream_schedules')
export class StreamSchedule {
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

  /** Maximum number of tokens (patients) allowed in this stream session */
  @Column({ type: 'int' })
  maxPatients: number;

  /** How many patients have booked so far (incremented on each booking) */
  @Column({ type: 'int', default: 0 })
  currentCount: number;

  /**
   * Whether this schedule is based on the doctor's RECURRING weekly template
   * or a CUSTOM date-specific override.
   */
  @Column({ type: 'enum', enum: SchedulingType })
  schedulingType: SchedulingType;

  @OneToMany(() => StreamBooking, (booking) => booking.stream, { cascade: true })
  bookings: StreamBooking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
