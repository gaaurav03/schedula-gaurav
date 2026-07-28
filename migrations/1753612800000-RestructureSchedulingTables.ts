import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: RestructureSchedulingTables
 *
 * Swaps and corrects the scheduling model:
 *
 * BEFORE (wrong):
 *   stream_schedules = exact slot-based (slotDurationMins, bufferTimeMins)
 *   stream_slots     = generated individual slots
 *   wave_schedules   = token-based (maxPatients, currentCount)
 *   wave_bookings    = patient token bookings
 *
 * AFTER (correct):
 *   stream_schedules = token-based (maxPatients, currentCount, schedulingType)
 *   stream_bookings  = patient token bookings (tokenNumber)
 *   wave_schedules   = exact slot-based (slotDurationMins, bufferTimeMins, schedulingType)
 *   wave_slots       = auto-generated individual slots
 *
 * Also adds schedulingType (RECURRING | CUSTOM) to both schedule tables so
 * patients can know if a schedule is based on recurring or custom availability.
 */
export class RestructureSchedulingTables1753612800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Drop old tables (order matters: child tables first) ─────────────────
    await queryRunner.query(`DROP TABLE IF EXISTS "stream_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stream_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wave_bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wave_schedules"`);

    // ─── Create schedulingType enum ───────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scheduling_type_enum" AS ENUM('RECURRING', 'CUSTOM');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // ─── stream_schedules (NOW: token-based) ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "stream_schedules" (
        "id"             UUID       NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"       UUID       NOT NULL,
        "date"           DATE       NOT NULL,
        "startTime"      VARCHAR(5) NOT NULL,
        "endTime"        VARCHAR(5) NOT NULL,
        "maxPatients"    INTEGER    NOT NULL,
        "currentCount"   INTEGER    NOT NULL DEFAULT 0,
        "schedulingType" "scheduling_type_enum" NOT NULL,
        "createdAt"      TIMESTAMP  NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stream_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stream_schedules_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);

    // ─── stream_bookings (token bookings per session) ─────────────────────────
    await queryRunner.query(`
      CREATE TABLE "stream_bookings" (
        "id"          UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "streamId"    UUID      NOT NULL,
        "patientId"   UUID      NOT NULL,
        "tokenNumber" INTEGER   NOT NULL,
        "bookedAt"    TIMESTAMP NOT NULL,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stream_bookings"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stream_bookings_patient" UNIQUE ("streamId", "patientId"),
        CONSTRAINT "UQ_stream_bookings_token"   UNIQUE ("streamId", "tokenNumber"),
        CONSTRAINT "FK_stream_bookings_stream"
          FOREIGN KEY ("streamId") REFERENCES "stream_schedules"("id") ON DELETE CASCADE
      )
    `);

    // ─── wave_schedules (NOW: exact slot-based) ───────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "wave_schedules" (
        "id"               UUID       NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"         UUID       NOT NULL,
        "date"             DATE       NOT NULL,
        "startTime"        VARCHAR(5) NOT NULL,
        "endTime"          VARCHAR(5) NOT NULL,
        "slotDurationMins" INTEGER    NOT NULL,
        "bufferTimeMins"   INTEGER    NOT NULL DEFAULT 0,
        "schedulingType"   "scheduling_type_enum" NOT NULL,
        "createdAt"        TIMESTAMP  NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wave_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wave_schedules_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);

    // ─── wave_slots (auto-generated exact appointment slots) ──────────────────
    await queryRunner.query(`
      CREATE TABLE "wave_slots" (
        "id"        UUID       NOT NULL DEFAULT uuid_generate_v4(),
        "waveId"    UUID       NOT NULL,
        "doctorId"  UUID       NOT NULL,
        "date"      DATE       NOT NULL,
        "slotStart" VARCHAR(5) NOT NULL,
        "slotEnd"   VARCHAR(5) NOT NULL,
        "isBooked"  BOOLEAN    NOT NULL DEFAULT false,
        "patientId" UUID,
        "bookedAt"  TIMESTAMP,
        "createdAt" TIMESTAMP  NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wave_slots"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wave_slots_patient" UNIQUE ("waveId", "patientId"),
        CONSTRAINT "FK_wave_slots_wave"
          FOREIGN KEY ("waveId") REFERENCES "wave_schedules"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wave_slots_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wave_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wave_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stream_bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stream_schedules"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "scheduling_type_enum"`);
  }
}
