import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: DropDoctorProfileConsultationFeeAndAvailability
 *
 * Removes `consultationFee` and `availabilityHours` columns
 * from the `doctor_profiles` table as they are no longer required
 * for the onboarding flow.
 */
export class DropDoctorProfileConsultationFeeAndAvailability1753289000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "doctor_profiles" DROP COLUMN IF EXISTS "consultationFee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_profiles" DROP COLUMN IF EXISTS "availabilityHours"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "doctor_profiles" ADD COLUMN "availabilityHours" VARCHAR(200) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_profiles" ADD COLUMN "consultationFee" DECIMAL(10,2) NOT NULL DEFAULT 0`,
    );
  }
}
