import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateAvailabilityTables
 *
 * Creates two new tables:
 *   - recurring_availability  (weekly repeating slots per doctor)
 *   - custom_availability     (date-specific overrides per doctor)
 *
 * Both tables:
 *   - Reference doctor_profiles.id with CASCADE DELETE
 *   - Have composite UNIQUE constraints to prevent exact duplicates
 */
export class CreateAvailabilityTables1753375200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Create DayOfWeek enum type ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "recurring_availability_dayofweek_enum" AS ENUM(
        'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
      )
    `);

    // ─── Create recurring_availability table ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "recurring_availability" (
        "id"          UUID                                      NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"    UUID                                      NOT NULL,
        "dayOfWeek"   "recurring_availability_dayofweek_enum"   NOT NULL,
        "startTime"   VARCHAR(5)                                NOT NULL,
        "endTime"     VARCHAR(5)                                NOT NULL,
        "createdAt"   TIMESTAMP                                 NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP                                 NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recurring_availability"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_recurring_availability_slot"    UNIQUE ("doctorId", "dayOfWeek", "startTime", "endTime"),
        CONSTRAINT "FK_recurring_availability_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);

    // ─── Create custom_availability table ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "custom_availability" (
        "id"           UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "doctorId"     UUID        NOT NULL,
        "date"         DATE        NOT NULL,
        "startTime"    VARCHAR(5)  NOT NULL,
        "endTime"      VARCHAR(5)  NOT NULL,
        "isAvailable"  BOOLEAN     NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP   NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custom_availability"         PRIMARY KEY ("id"),
        CONSTRAINT "UQ_custom_availability_slot"    UNIQUE ("doctorId", "date", "startTime", "endTime"),
        CONSTRAINT "FK_custom_availability_doctor"
          FOREIGN KEY ("doctorId") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_availability"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_availability"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "recurring_availability_dayofweek_enum"`,
    );
  }
}
