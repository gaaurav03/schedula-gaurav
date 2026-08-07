import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add recurringAvailabilityId FK column to wave_schedules and stream_schedules.
 * This column allows the Elastic Scheduling system to trace which sessions were
 * auto-generated from a specific RecurringAvailability template.
 */
export class AddRecurringAvailabilityIdToSchedules1754400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add to wave_schedules
    await queryRunner.query(`
      ALTER TABLE "wave_schedules"
      ADD COLUMN IF NOT EXISTS "recurringAvailabilityId" uuid DEFAULT NULL
    `);

    // Add to stream_schedules
    await queryRunner.query(`
      ALTER TABLE "stream_schedules"
      ADD COLUMN IF NOT EXISTS "recurringAvailabilityId" uuid DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wave_schedules" DROP COLUMN IF EXISTS "recurringAvailabilityId"
    `);
    await queryRunner.query(`
      ALTER TABLE "stream_schedules" DROP COLUMN IF EXISTS "recurringAvailabilityId"
    `);
  }
}
