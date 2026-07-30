import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WaveSchedule } from './wave-schedule.entity';
import { DoctorProfile } from './doctor-profile.entity';

/**
 * WaveSlot: A single auto-generated exact appointment slot within a WAVE schedule.
 * Each slot has a fixed start/end time. Patient books one slot → gets exact time.
 */
@Entity('wave_slots')
export class WaveSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WaveSchedule, (wave) => wave.slots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waveId' })
  wave: WaveSchedule;

  @Column({ type: 'uuid' })
  waveId: string;

  /** Denormalized for efficient patient queries by doctorId + date */
  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  /** Denormalized date for efficient patient queries */
  @Column({ type: 'date' })
  date: string;

  /** Slot start time "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  slotStart: string;

  /** Slot end time "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  slotEnd: string;

  /** Whether this slot has already been booked by a patient */
  @Column({ type: 'boolean', default: false })
  isBooked: boolean;

  /** Patient profile ID who booked this slot (null if unbooked) */
  @Column({ type: 'uuid', nullable: true })
  patientId: string | null;

  /** When the booking was made */
  @Column({ type: 'timestamp', nullable: true })
  bookedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
