import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateAppointmentTable
 *
 * Creates the unified `appointments` table — a single source of truth for
 * every patient booking across both scheduling modes:
 *
 *   STREAM (token-based) → tokenNumber + streamBookingId populated
 *   WAVE   (exact slot)  → waveSlotId populated
 *
 * Uses existing `scheduling_type_enum` (RECURRING | CUSTOM) defined in
 * RestructureSchedulingTables migration.
 */
export class CreateAppointmentTable1753780000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create appointment-specific enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appointment_status_enum" AS ENUM('BOOKED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appointment_type_enum" AS ENUM('STREAM', 'WAVE');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // Create appointments table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appointments" (
        "id"              UUID NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"        UUID NOT NULL,
        "patientId"       UUID NOT NULL,
        "date"            DATE NOT NULL,
        "startTime"       VARCHAR(5) NOT NULL,
        "endTime"         VARCHAR(5) NOT NULL,
        "status"          "appointment_status_enum" NOT NULL DEFAULT 'BOOKED',
        "appointmentType" "appointment_type_enum" NOT NULL,
        "schedulingType"  "scheduling_type_enum" NOT NULL,
        "tokenNumber"     INTEGER,
        "streamBookingId" UUID,
        "waveSlotId"      UUID,
        "cancelledAt"     TIMESTAMP,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_appointments_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointments_patient"
          FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE
      )
    `);

    // Index: fast lookups by patient and by doctor
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_appointments_patientId_date"
        ON "appointments"("patientId", "date")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_appointments_doctorId_date"
        ON "appointments"("doctorId", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_appointments_doctorId_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_appointments_patientId_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appointments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appointment_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appointment_status_enum"`);
  }
}
