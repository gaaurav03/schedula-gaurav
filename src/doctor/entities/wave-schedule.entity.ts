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
import { WaveBooking } from './wave-booking.entity';

@Entity('wave_schedules')
export class WaveSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ManyToOne: one doctor can have many wave schedules.
   * CASCADE DELETE removes wave schedules when doctor profile is deleted.
   */
  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  /** Specific date for this wave: "YYYY-MM-DD" */
  @Column({ type: 'date' })
  date: string;

  /** Wave window start: "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** Wave window end: "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /** Maximum patients allowed in this wave */
  @Column({ type: 'int' })
  maxPatients: number;

  /** Current number of bookings (incremented on each successful booking) */
  @Column({ type: 'int', default: 0 })
  currentCount: number;

  /** Bookings linked to this wave */
  @OneToMany(() => WaveBooking, (booking) => booking.wave, { cascade: true })
  bookings: WaveBooking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
