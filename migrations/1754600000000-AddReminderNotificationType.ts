import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the APPOINTMENT_REMINDER value to the notification_type_enum PostgreSQL enum.
 *
 * PostgreSQL does not allow removing enum values, so the down() migration
 * cannot truly revert this change. It is left as a no-op comment.
 */
export class AddReminderNotificationType1754600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL: ADD VALUE is committed immediately and cannot run inside a transaction.
    // TypeORM migrations run in transactions by default, so we must use COMMIT/BEGIN
    // to work around this.
    await queryRunner.query(`COMMIT`);
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REMINDER'`,
    );
    await queryRunner.query(`BEGIN`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values.
    // To roll back: drop and recreate the enum without the value (complex, risky).
    // Left as no-op. Reverting this migration is a manual DBA operation.
  }
}
