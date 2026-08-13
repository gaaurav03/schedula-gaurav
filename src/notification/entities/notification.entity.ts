import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { PatientProfile } from '../../patient/entities/patient-profile.entity';
import { Appointment } from '../../appointment/entities/appointment.entity';

export enum NotificationType {
  APPOINTMENT_BOOKED = 'APPOINTMENT_BOOKED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_AUTO_REASSIGNED = 'APPOINTMENT_AUTO_REASSIGNED',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
}

/**
 * Unique composite index: prevents more than one notification of the same
 * type being created for the same appointment (e.g. duplicate reminders).
 */
@Index('UQ_notification_appt_type', ['appointmentId', 'type'], { unique: true })
@Index('IDX_notifications_patientId', ['patientId'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The patient who receives this notification */
  @ManyToOne(() => PatientProfile, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'patientId' })
  patient: PatientProfile;

  @Column({ type: 'uuid' })
  patientId: string;

  /** The appointment this notification relates to */
  @ManyToOne(() => Appointment, { onDelete: 'SET NULL', eager: false, nullable: true })
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  @Column({ type: 'uuid', nullable: true })
  appointmentId: string | null;

  /** Type of event that triggered this notification */
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  /** Short heading displayed to the patient */
  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** Full human-readable message with doctor name, date, time */
  @Column({ type: 'text' })
  message: string;

  /** Whether the patient has read this notification */
  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
