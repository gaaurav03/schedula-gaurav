import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add RESCHEDULED to appointment status enum and
 * add rescheduledAt + rescheduleReason audit columns to appointments table.
 *
 * Fix: The correct enum name is "appointment_status_enum" (not "appointments_status_enum").
 * PostgreSQL ADD VALUE cannot run inside a transaction, so we COMMIT first.
 */
export class AddRescheduledStatusAndAuditColumns1754400000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL: ADD VALUE cannot run inside a transaction — commit first.
    await queryRunner.query(`COMMIT`);
    await queryRunner.query(`
      ALTER TYPE "appointment_status_enum" ADD VALUE IF NOT EXISTS 'RESCHEDULED'
    `);
    await queryRunner.query(`BEGIN`);

    // Add rescheduledAt column
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "rescheduledAt" timestamp DEFAULT NULL
    `);

    // Add rescheduleReason column
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD COLUMN IF NOT EXISTS "rescheduleReason" character varying(500) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "appointments" DROP COLUMN IF EXISTS "rescheduleReason"
    `);
    await queryRunner.query(`
      ALTER TABLE "appointments" DROP COLUMN IF EXISTS "rescheduledAt"
    `);
    // Note: PostgreSQL does not support removing enum values; you'd need to recreate the type.
  }
}
