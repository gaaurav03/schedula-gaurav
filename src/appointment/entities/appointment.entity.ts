import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DoctorProfile } from '../../doctor/entities/doctor-profile.entity';
import { PatientProfile } from '../../patient/entities/patient-profile.entity';
import { SchedulingType } from '../../doctor/entities/stream-schedule.entity';

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
}

export enum AppointmentType {
  STREAM = 'STREAM',
  WAVE = 'WAVE',
}

/**
 * Appointment: Unified booking record on top of the Stream/Wave scheduling system.
 *
 * Every patient booking — whether token-based (STREAM) or exact-slot (WAVE) —
 * produces one Appointment row. This gives a clean single source of truth for:
 *   - Patient appointment history (GET /appointment/my)
 *   - Doctor appointment view     (GET /doctor/appointments)
 *   - Cancellation management     (PATCH /appointment/:id/cancel)
 */
@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Parties ──────────────────────────────────────────────────────────────

  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'doctorId' })
  doctor: DoctorProfile;

  @Column({ type: 'uuid' })
  doctorId: string;

  @ManyToOne(() => PatientProfile, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'patientId' })
  patient: PatientProfile;

  @Column({ type: 'uuid' })
  patientId: string;

  // ── Slot Details ──────────────────────────────────────────────────────────

  /** Appointment date: "YYYY-MM-DD" */
  @Column({ type: 'date' })
  date: string;

  /** Session/slot start: "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** Session/slot end: "HH:mm" */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  // ── Status & Classification ───────────────────────────────────────────────

  @Column({ type: 'enum', enum: AppointmentStatus, default: AppointmentStatus.BOOKED })
  status: AppointmentStatus;

  /** STREAM = token-based session | WAVE = exact time slot */
  @Column({ type: 'enum', enum: AppointmentType })
  appointmentType: AppointmentType;

  /** RECURRING = from weekly template | CUSTOM = from date-specific override */
  @Column({ type: 'enum', enum: SchedulingType })
  schedulingType: SchedulingType;

  // ── Booking References ────────────────────────────────────────────────────

  /** STREAM only: patient's sequential token number (e.g. 3 = Token #3) */
  @Column({ type: 'int', nullable: true })
  tokenNumber: number | null;

  /** STREAM only: FK → stream_bookings.id */
  @Column({ type: 'uuid', nullable: true })
  streamBookingId: string | null;

  /** WAVE only: FK → wave_slots.id */
  @Column({ type: 'uuid', nullable: true })
  waveSlotId: string | null;

  // ── Cancellation ──────────────────────────────────────────────────────────

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
