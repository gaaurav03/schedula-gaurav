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

@Entity('wave_bookings')
export class WaveBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ManyToOne: many bookings belong to one wave schedule.
   * CASCADE DELETE removes bookings when the wave is deleted.
   */
  @ManyToOne(() => WaveSchedule, (wave) => wave.bookings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'waveId' })
  wave: WaveSchedule;

  @Column({ type: 'uuid' })
  waveId: string;

  /** Patient profile ID who made this booking */
  @Column({ type: 'uuid' })
  patientId: string;

  /**
   * Token number assigned in booking order.
   * 1st patient → Token 1, 2nd → Token 2, etc.
   */
  @Column({ type: 'int' })
  tokenNumber: number;

  /** Timestamp when the booking was made */
  @Column({ type: 'timestamp' })
  bookedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
