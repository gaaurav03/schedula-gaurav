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

/**
 * StreamBooking: A single patient token booking within a STREAM session.
 * Each booking holds the patient's token number (e.g. Token #3).
 */
@Entity('stream_bookings')
export class StreamBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StreamSchedule, (stream) => stream.bookings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'streamId' })
  stream: StreamSchedule;

  @Column({ type: 'uuid' })
  streamId: string;

  /** The patient who made this booking */
  @Column({ type: 'uuid' })
  patientId: string;

  /**
   * Sequential token number assigned in booking order.
   * 1st to book → Token 1, 2nd → Token 2, etc.
   */
  @Column({ type: 'int' })
  tokenNumber: number;

  /** When the booking was made */
  @Column({ type: 'timestamp' })
  bookedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
