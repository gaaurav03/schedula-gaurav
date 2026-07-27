# 🏥 Schedula Backend API

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="100" alt="NestJS Logo" />
</p>

<p align="center">
  <b>A Scalable, Role-Based Medical Appointment & Doctor Availability Backend API built with NestJS, TypeORM, and PostgreSQL.</b>
</p>

<p align="center">
  <a href="#-key-features"><img src="https://img.shields.io/badge/NestJS-11.x-red?style=flat-square&logo=nestjs" alt="NestJS"></a>
  <a href="#-tech-stack--architecture"><img src="https://img.shields.io/badge/PostgreSQL-Neon_Cloud-blue?style=flat-square&logo=postgresql" alt="PostgreSQL"></a>
  <a href="#-tech-stack--architecture"><img src="https://img.shields.io/badge/TypeORM-0.3.x-orange?style=flat-square&logo=typeorm" alt="TypeORM"></a>
  <a href="#-authentication--rbac"><img src="https://img.shields.io/badge/Auth-JWT_Passport-green?style=flat-square&logo=jsonwebtokens" alt="JWT"></a>
  <a href="#-database-migrations"><img src="https://img.shields.io/badge/Migrations-Enabled-brightgreen?style=flat-square" alt="Migrations"></a>
</p>

---

## 📖 Overview

**Schedula** is a robust backend system designed for modern healthcare platforms. It manages doctor and patient onboarding, role-based access control, weekly availability templates, date overrides, and dual appointment scheduling strategies (**Stream** and **Wave**).

The architecture adheres to production-grade backend standards:
- 🔒 **Zero-trust security**: Every endpoint is guarded with Passport JWT authentication and custom metadata role guards.
- 🗄️ **Migration-Driven DB Management**: `synchronize: false` is strictly enforced. Schema evolution is managed entirely through TypeORM migration files.
- ⚡ **Dual Scheduling Engines**: Supports both exact time-slot generation (Stream Mode) and token-based capacity windows (Wave Mode).

---

## ✨ Key Features

### 🔐 1. Authentication & Role-Based Access Control (RBAC)
- **Role Registration**: Users register as either **`DOCTOR`** or **`PATIENT`**.
- **JWT Authentication**: Passport JWT strategy issuing signed access tokens with custom expiration.
- **Secure Password Hashing**: Passwords salted and hashed with **bcrypt** (10 salt rounds).
- **Custom Guards & Decorators**: `@Roles(Role.DOCTOR)` and `@Roles(Role.PATIENT)` decorators enforced via `RolesGuard` and `JwtAuthGuard`.

### 🩺 2. Doctor & Patient Onboarding
- **One-to-One Entity Mapping**: Each authenticated user links to exactly one profile entity (`DoctorProfile` or `PatientProfile`).
- **Doctor Profiles**: Specialization, experience years, qualifications, and biography details.
- **Patient Profiles**: Age, gender (Enum: `MALE`, `FEMALE`, `OTHER`), contact details, blood group, medical history, and allergies.
- **Edge Case Protection**: Prevents duplicate profile creation (`409 Conflict`) and guards un-onboarded profile queries (`404 Not Found`).

### 📅 3. Doctor Availability (Recurring + Custom Override)
- **Weekly Recurring Availability**: Set repeating slots for any day of the week (e.g. `MONDAY 10:00–13:00`).
- **Date-Specific Overrides**: Override recurring slots for a specific date (e.g. `2026-06-15 14:00–15:00`) or mark a date completely unavailable.
- **Smart Date Resolution**: `GET /doctor/availability/date?date=YYYY-MM-DD` prioritizes custom date overrides over weekly recurring templates.
- **Overlap & Range Validation**: Interval overlap detection (`newStart < existEnd && newEnd > existStart`) prevents conflicting slots.

### ⚡ 4. Advanced Doctor Scheduling (Stream & Wave Modes)
Different clinical practice styles require different scheduling mechanisms:

#### **Stream Scheduling (Exact Time Slots)**
- *Ideal for*: Psychologists, Dermatologists, Specialists requiring fixed appointment durations.
- **Auto-Slot Division**: The server divides a time window (e.g. 10:00 AM – 11:00 AM) into exact time slots based on `slotDurationMins` (e.g. 15 mins) and `bufferTimeMins` (e.g. 5 mins).
- **Exact Booking**: Patients view unbooked slots and receive an exact appointment time (e.g. `10:00 – 10:15`).
- **Double Booking Prevention**: Enforces a unique database constraint per schedule per patient.

#### **Wave Scheduling (Token-Based Capacity)**
- *Ideal for*: General Physicians, OPD Clinics, High-volume hospitals.
- **Capacity Management**: Doctors specify a time window (e.g. 10:00 AM – 12:00 PM) and a maximum patient capacity (e.g. 5 patients).
- **Sequential Token Numbers**: As patients book into a wave, the system assigns sequential tokens (`Token #1`, `Token #2`, etc.).
- **Overbooking Prevention**: Throws `409 Conflict` ("Wave is full") when capacity is reached.

---

## 🛠️ Tech Stack & Architecture

| Component | Technology | Description |
|---|---|---|
| **Framework** | NestJS v11 | Modular TypeScript server framework |
| **Language** | TypeScript v5 | Type-safe enterprise JavaScript |
| **Database** | PostgreSQL | Hosted on Neon Cloud PostgreSQL |
| **ORM** | TypeORM v0.3 | Data Mapper pattern with migrations |
| **Auth** | Passport & JWT | Bearer token authentication |
| **Validation** | `class-validator` | DTO payload sanitization & regex rules |
| **Password Hashing** | `bcrypt` | 10-round salted hash |

---

## 🗄️ Database Migrations

In compliance with production standards, `synchronize: false` is enforced in `app.module.ts`. Database updates are handled via TypeORM migration files located in `migrations/`.

### Migration Commands

```bash
# Run all pending migrations
npm run migration:run

# Revert the last executed migration
npm run migration:revert

# Generate a new migration based on entity changes
npm run migration:generate
```

### Applied Migrations Summary
1. `1753202400000-CreateDoctorPatientProfiles.ts`: Creates `doctor_profiles` and `patient_profiles` tables.
2. `1753289000000-DropDoctorProfileConsultationFeeAndAvailability.ts`: Drops deprecated profile columns.
3. `1753375200000-CreateAvailabilityTables.ts`: Creates `recurring_availability` and `custom_availability` tables.
4. `1753461600000-CreateSchedulingTables.ts`: Creates `stream_schedules`, `stream_slots`, `wave_schedules`, and `wave_bookings` tables.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **PostgreSQL**: Local instance or Cloud DB (e.g. Neon PostgreSQL)

### 1. Installation

```bash
git clone https://github.com/gaaurav03/schedula-gaurav.git
cd schedula-gaurav
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory (refer to `.env.example`):

```env
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=your-postgres-host
DB_PORT=5432
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_NAME=your-database-name
DB_SYNCHRONIZE=false
DB_LOGGING=true
DB_SSL=true

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d
```

### 3. Database Setup & Migrations

Execute pending migrations to build the PostgreSQL database schema:

```bash
npm run migration:run
```

### 4. Running the Application

```bash
# Development mode (watch mode)
npm run start:dev

# Production build & run
npm run build
npm run start:prod
```

The application will start on `http://localhost:3000`.

---

## 📋 API Reference Table

### 🔑 Authentication (`/auth`)
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/auth/signup` | Public | Register user as `DOCTOR` or `PATIENT` |
| `POST` | `/auth/login` | Public | Authenticate user & return JWT Bearer token |

### 🩺 Doctor Profile (`/doctor/profile`)
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/doctor/profile` | DOCTOR | Create doctor onboarding profile |
| `GET` | `/doctor/profile` | DOCTOR | Get authenticated doctor profile |
| `PATCH` | `/doctor/profile` | DOCTOR | Update doctor profile details |

### 👤 Patient Profile (`/patient/profile`)
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/patient/profile` | PATIENT | Create patient onboarding profile |
| `GET` | `/patient/profile` | PATIENT | Get authenticated patient profile |
| `PATCH` | `/patient/profile` | PATIENT | Update patient profile details |

### 📅 Doctor Availability (`/doctor/availability`)
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/doctor/availability` | DOCTOR | Add weekly recurring availability slot |
| `GET` | `/doctor/availability` | DOCTOR | View all weekly recurring slots |
| `PATCH` | `/doctor/availability/:id` | DOCTOR | Update a recurring availability slot |
| `DELETE` | `/doctor/availability/:id` | DOCTOR | Delete a recurring availability slot |
| `POST` | `/doctor/availability/override` | DOCTOR | Add date-specific custom override slot |
| `GET` | `/doctor/availability/date?date=YYYY-MM-DD` | DOCTOR | Fetch effective availability for a date |

### ⚡ Doctor Scheduling Management (`/doctor/schedule`)
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/doctor/schedule/stream` | DOCTOR | Create stream schedule (auto-generates slots) |
| `GET` | `/doctor/schedule/stream` | DOCTOR | List all doctor stream schedules |
| `GET` | `/doctor/schedule/stream/:id/slots` | DOCTOR | View generated slots for a schedule |
| `POST` | `/doctor/schedule/wave` | DOCTOR | Create wave schedule with capacity limit |
| `GET` | `/doctor/schedule/wave` | DOCTOR | List all doctor wave schedules |

### 🎟️ Patient Appointment Booking (`/patient/schedule`)
| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/patient/schedule/stream?doctorId=&date=` | PATIENT | View unbooked exact stream time slots |
| `POST` | `/patient/schedule/stream/:slotId/book` | PATIENT | Book exact stream slot |
| `GET` | `/patient/schedule/wave?doctorId=&date=` | PATIENT | View wave schedules & remaining capacity |
| `POST` | `/patient/schedule/wave/:waveId/book` | PATIENT | Book wave slot (returns token number) |

---

## 📂 Project Structure

```
schedula-gaurav/
├── migrations/                        # TypeORM Migration files
│   ├── 1753202400000-CreateDoctorPatientProfiles.ts
│   ├── 1753289000000-DropDoctorProfileConsultationFeeAndAvailability.ts
│   ├── 1753375200000-CreateAvailabilityTables.ts
│   └── 1753461600000-CreateSchedulingTables.ts
├── src/
│   ├── auth/                          # Auth Module (JWT, Passport, Guards, Decorators)
│   │   ├── decorators/                # @Roles() and @GetUser() custom decorators
│   │   ├── dto/                       # SignupDto, LoginDto
│   │   ├── guards/                    # JwtAuthGuard, RolesGuard
│   │   └── strategies/                # JwtStrategy
│   ├── doctor/                        # Doctor Module (Profiles, Availability, Scheduling)
│   │   ├── dto/                       # DTOs for Profiles, Availability, Stream & Wave
│   │   ├── entities/                  # DoctorProfile, Availability & Scheduling Entities
│   │   ├── availability.controller.ts # Availability endpoints
│   │   ├── availability.service.ts    # Overlap validation & smart date fallback
│   │   ├── scheduling.controller.ts   # Stream & Wave doctor management endpoints
│   │   └── scheduling.service.ts      # Slot division math & wave capacity logic
│   ├── patient/                       # Patient Module (Profiles & Appointment Booking)
│   │   ├── dto/                       # Patient Profile DTOs
│   │   ├── entities/                  # PatientProfile Entity
│   │   ├── scheduling.controller.ts   # Patient Stream & Wave booking endpoints
│   │   └── scheduling.service.ts      # Slot booking & sequential token assignment
│   ├── users/                         # User Module (User Entity & Password Hashing)
│   ├── app.module.ts                  # Root App Module (TypeORM & Config injection)
│   └── main.ts                        # Application Bootstrap (Global ValidationPipe)
├── data-source.ts                     # TypeORM CLI DataSource configuration
├── package.json
└── README.md
```

---

## 🧪 Testing & Verification

1. **Build Verification**: Run `npm run build` to verify zero TypeScript errors.
2. **Migration Verification**: Run `npm run migration:run` to confirm all 4 migrations execute cleanly against PostgreSQL.
3. **Postman API Testing**: Import API endpoints and pass Bearer tokens in the `Authorization` header (`Type: Bearer Token`).

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
