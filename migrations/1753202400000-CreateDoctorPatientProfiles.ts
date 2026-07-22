import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateDoctorPatientProfiles
 *
 * Creates two new tables:
 *   - doctor_profiles  (linked to users via OneToOne FK on userId)
 *   - patient_profiles (linked to users via OneToOne FK on userId)
 *
 * Both tables have a UNIQUE constraint on userId to enforce one profile per user.
 * CASCADE delete ensures profiles are removed when the parent user is deleted.
 */
export class CreateDoctorPatientProfiles1753202400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Create gender enum type ─────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "patient_profiles_gender_enum" AS ENUM('MALE', 'FEMALE', 'OTHER')`,
    );

    // ─── Create doctor_profiles table ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "doctor_profiles" (
        "id"                UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"            UUID          NOT NULL,
        "fullName"          VARCHAR(100)  NOT NULL,
        "specialization"    VARCHAR(100)  NOT NULL,
        "experienceYears"   INTEGER       NOT NULL,
        "qualification"     VARCHAR(200)  NOT NULL,
        "consultationFee"   DECIMAL(10,2) NOT NULL,
        "availabilityHours" VARCHAR(200)  NOT NULL,
        "profileDetails"    TEXT,
        "createdAt"         TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_doctor_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "FK_doctor_profiles_users"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ─── Create patient_profiles table ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "patient_profiles" (
        "id"             UUID                              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"         UUID                              NOT NULL,
        "fullName"       VARCHAR(100)                      NOT NULL,
        "age"            INTEGER                           NOT NULL,
        "gender"         "patient_profiles_gender_enum"    NOT NULL,
        "contactNumber"  VARCHAR(20)                       NOT NULL,
        "address"        VARCHAR(300),
        "bloodGroup"     VARCHAR(10),
        "medicalHistory" TEXT,
        "allergies"      TEXT,
        "createdAt"      TIMESTAMP                         NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP                         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patient_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_patient_profiles_userId" UNIQUE ("userId"),
        CONSTRAINT "FK_patient_profiles_users"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_profiles"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "patient_profiles_gender_enum"`,
    );
  }
}
