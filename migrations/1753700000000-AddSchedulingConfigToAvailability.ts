import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddSchedulingConfigToAvailability
 *
 * Adds scheduling configuration columns to both availability tables so doctors
 * can embed HOW appointments should be scheduled directly in their availability:
 *
 *   recurring_availability:
 *     + schedulingMode   (STREAM | WAVE)
 *     + maxPatients      (STREAM: token capacity)
 *     + slotDurationMins (WAVE: each slot's duration)
 *     + bufferTimeMins   (WAVE: gap between slots)
 *
 *   custom_availability:
 *     + same four columns (nullable because isAvailable=false overrides need no config)
 *
 * This enables the "smart availability" patient endpoint which auto-resolves
 * and auto-creates the correct stream/wave session for any queried date.
 */
export class AddSchedulingConfigToAvailability1753700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the scheduling mode enum (STREAM | WAVE)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scheduling_mode_enum" AS ENUM('STREAM', 'WAVE');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // ─── recurring_availability ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "recurring_availability"
        ADD COLUMN IF NOT EXISTS "schedulingMode"   "scheduling_mode_enum" NOT NULL DEFAULT 'STREAM',
        ADD COLUMN IF NOT EXISTS "maxPatients"      INTEGER,
        ADD COLUMN IF NOT EXISTS "slotDurationMins" INTEGER,
        ADD COLUMN IF NOT EXISTS "bufferTimeMins"   INTEGER DEFAULT 0
    `);

    // ─── custom_availability ─────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "custom_availability"
        ADD COLUMN IF NOT EXISTS "schedulingMode"   "scheduling_mode_enum",
        ADD COLUMN IF NOT EXISTS "maxPatients"      INTEGER,
        ADD COLUMN IF NOT EXISTS "slotDurationMins" INTEGER,
        ADD COLUMN IF NOT EXISTS "bufferTimeMins"   INTEGER DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "custom_availability"
        DROP COLUMN IF EXISTS "schedulingMode",
        DROP COLUMN IF EXISTS "maxPatients",
        DROP COLUMN IF EXISTS "slotDurationMins",
        DROP COLUMN IF EXISTS "bufferTimeMins"
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_availability"
        DROP COLUMN IF EXISTS "schedulingMode",
        DROP COLUMN IF EXISTS "maxPatients",
        DROP COLUMN IF EXISTS "slotDurationMins",
        DROP COLUMN IF EXISTS "bufferTimeMins"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "scheduling_mode_enum"`);
  }
}
