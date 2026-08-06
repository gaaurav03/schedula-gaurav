import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add RESCHEDULED status to appointment_status_enum
 *            and add rescheduled_at + reschedule_reason audit columns.
 */
export class AddReschedulingSupport1754330000000 implements MigrationInterface {
  name = 'AddReschedulingSupport1754330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add RESCHEDULED to the enum (safe — additive change)
    await queryRunner.query(
      `ALTER TYPE "appointment_status_enum" ADD VALUE IF NOT EXISTS 'RESCHEDULED'`,
    );

    // Add audit columns for rescheduling
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "rescheduledAt" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "rescheduleReason" VARCHAR(500) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove audit columns
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN IF EXISTS "rescheduleReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN IF EXISTS "rescheduledAt"`,
    );
    // Note: PostgreSQL does not support DROP VALUE from an enum.
    // To fully revert the enum, recreate it without RESCHEDULED.
  }
}
