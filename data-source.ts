import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * TypeORM CLI DataSource configuration.
 * Used by migration:generate, migration:run, migration:revert scripts.
 * This file is NOT imported by the NestJS app — it is only for the TypeORM CLI.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medical_appointment_db',
  entities: ['src/**/*.entity.ts'],
  migrations: ['migrations/*.ts'],
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
