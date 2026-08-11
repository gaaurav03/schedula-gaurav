import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1754500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_type_enum" AS ENUM (
          'APPOINTMENT_BOOKED',
          'APPOINTMENT_CANCELLED',
          'APPOINTMENT_RESCHEDULED',
          'APPOINTMENT_AUTO_REASSIGNED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "patientId"     uuid NOT NULL,
        "appointmentId" uuid,
        "type"          "notification_type_enum" NOT NULL,
        "title"         varchar(200) NOT NULL,
        "message"       text NOT NULL,
        "isRead"        boolean NOT NULL DEFAULT false,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "UQ_notification_appt_type"
        UNIQUE ("appointmentId", "type")
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "FK_notifications_patient"
        FOREIGN KEY ("patientId")
        REFERENCES "patient_profiles"("id")
        ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ADD CONSTRAINT "FK_notifications_appointment"
        FOREIGN KEY ("appointmentId")
        REFERENCES "appointments"("id")
        ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_patientId"
        ON "notifications" ("patientId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_patientId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
  }
}
