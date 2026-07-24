import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StreamSchedule } from './stream-schedule.entity';
import { DoctorProfile } from './doctor-profile.entity';

@Entity('stream_slots')
export class StreamSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Parent schedule that generated this slot.
   * CASCADE DELETE removes slots when the schedule is deleted.
   */
  @ManyToOne(() => StreamSchedule, (schedule) => schedule.slots, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scheduleId' })
  schedule: StreamSchedule;

  @Column({ type: 'uuid' })
  scheduleId: string;

  /** Denormalized for efficient patient queries by doctorId + date */
  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  /** Denormalized date for easy patient queries */
  @Column({ type: 'date' })
  date: string;

  /** Slot start time "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  slotStart: string;

  /** Slot end time "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  slotEnd: string;

  /** Whether this slot has been booked by a patient */
  @Column({ type: 'boolean', default: false })
  isBooked: boolean;

  /** Patient profile ID who booked this slot (null if not booked) */
  @Column({ type: 'uuid', nullable: true })
  patientId: string | null;

  /** Timestamp of when the booking was made */
  @Column({ type: 'timestamp', nullable: true })
  bookedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
