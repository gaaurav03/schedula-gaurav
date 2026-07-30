import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * TypeORM CLI DataSource configuration.
 * Used by migration:generate, migration:run, migration:revert scripts.
 * This file is NOT imported by the NestJS app — it is only for the TypeORM CLI.
 *
 * Supports two modes:
 *   - Production (Render/Neon): reads DATABASE_URL connection string
 *   - Local dev: reads individual DB_* environment variables
 */
const databaseUrl = process.env.DATABASE_URL;

export default new DataSource(
  databaseUrl
    ? // ── Cloud DB (Neon / Railway / Supabase) ──────────────────────────────
      {
        type: 'postgres',
        url: databaseUrl,
        entities: ['src/**/*.entity.ts'],
        migrations: ['migrations/*.ts'],
        ssl: { rejectUnauthorized: false },
      }
    : // ── Local development ─────────────────────────────────────────────────
      {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'medical_appointment_db',
        entities: ['src/**/*.entity.ts'],
        migrations: ['migrations/*.ts'],
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      },
);
