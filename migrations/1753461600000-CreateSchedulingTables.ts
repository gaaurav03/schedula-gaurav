import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateSchedulingTables
 *
 * Creates four new tables for the Advanced Scheduling system:
 *   - stream_schedules  (doctor stream config per date)
 *   - stream_slots      (auto-generated individual appointment slots)
 *   - wave_schedules    (doctor wave config per date with capacity)
 *   - wave_bookings     (patient bookings with token numbers)
 */
export class CreateSchedulingTables1753461600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── stream_schedules ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "stream_schedules" (
        "id"               UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"         UUID        NOT NULL,
        "date"             DATE        NOT NULL,
        "startTime"        VARCHAR(5)  NOT NULL,
        "endTime"          VARCHAR(5)  NOT NULL,
        "slotDurationMins" INTEGER     NOT NULL,
        "bufferTimeMins"   INTEGER     NOT NULL DEFAULT 0,
        "createdAt"        TIMESTAMP   NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stream_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stream_schedules_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);

    // ─── stream_slots ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "stream_slots" (
        "id"          UUID       NOT NULL DEFAULT uuid_generate_v4(),
        "scheduleId"  UUID       NOT NULL,
        "doctorId"    UUID       NOT NULL,
        "date"        DATE       NOT NULL,
        "slotStart"   VARCHAR(5) NOT NULL,
        "slotEnd"     VARCHAR(5) NOT NULL,
        "isBooked"    BOOLEAN    NOT NULL DEFAULT false,
        "patientId"   UUID,
        "bookedAt"    TIMESTAMP,
        "createdAt"   TIMESTAMP  NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stream_slots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stream_slots_patient_schedule" UNIQUE ("scheduleId", "patientId"),
        CONSTRAINT "FK_stream_slots_schedule"
          FOREIGN KEY ("scheduleId") REFERENCES "stream_schedules"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stream_slots_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);

    // ─── wave_schedules ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "wave_schedules" (
        "id"           UUID       NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"     UUID       NOT NULL,
        "date"         DATE       NOT NULL,
        "startTime"    VARCHAR(5) NOT NULL,
        "endTime"      VARCHAR(5) NOT NULL,
        "maxPatients"  INTEGER    NOT NULL,
        "currentCount" INTEGER    NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMP  NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wave_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wave_schedules_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);

    // ─── wave_bookings ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "wave_bookings" (
        "id"          UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "waveId"      UUID      NOT NULL,
        "patientId"   UUID      NOT NULL,
        "tokenNumber" INTEGER   NOT NULL,
        "bookedAt"    TIMESTAMP NOT NULL,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wave_bookings"                 PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wave_bookings_patient"         UNIQUE ("waveId", "patientId"),
        CONSTRAINT "UQ_wave_bookings_token"           UNIQUE ("waveId", "tokenNumber"),
        CONSTRAINT "FK_wave_bookings_wave"
          FOREIGN KEY ("waveId") REFERENCES "wave_schedules"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wave_bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wave_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stream_slots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stream_schedules"`);
  }
}
