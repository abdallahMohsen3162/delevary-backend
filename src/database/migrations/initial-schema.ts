import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791490000000 implements MigrationInterface {
  name = 'InitialSchema1791490000000';
  async up(runner: QueryRunner) {
    // Clean database migration. Existing development synchronize databases must be baselined,
    // not silently marked as migrated or recreated.
    await runner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TYPE users_role_enum AS ENUM ('CUSTOMER','RIDER');
      CREATE TYPE users_vehicle_type_enum AS ENUM ('MOTORCYCLE','CAR','BICYCLE','TUKTUK');
      CREATE TYPE verification_role_enum AS ENUM ('CUSTOMER','RIDER');
      CREATE TYPE verification_purpose_enum AS ENUM ('SIGNUP','PASSWORD_RESET','VERIFY_EMAIL');
      CREATE TYPE verification_channel_enum AS ENUM ('WHATSAPP','EMAIL');
      CREATE TYPE message_jobs_channel_enum AS ENUM ('WHATSAPP','EMAIL');
      CREATE TYPE trips_vehicle_type_enum AS ENUM ('MOTORCYCLE','CAR','BICYCLE','TUKTUK');
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), phone varchar(20) NOT NULL UNIQUE, email varchar(254) UNIQUE,
        full_name varchar(80) NOT NULL, role users_role_enum NOT NULL, password_hash text NOT NULL,
        phone_verified_at timestamptz, email_verified_at timestamptz, is_rider_verified boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true, vehicle_type users_vehicle_type_enum, fcm_token text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX sessions_user_idx ON sessions(user_id);
      CREATE TABLE verification (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        role verification_role_enum NOT NULL, purpose verification_purpose_enum NOT NULL, channel verification_channel_enum NOT NULL,
        code varchar(6) NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0), expires_at timestamptz NOT NULL,
        consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX verification_rate_idx ON verification(user_id,purpose,created_at);
      CREATE TABLE message_jobs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), challenge_id uuid NOT NULL UNIQUE REFERENCES verification(id) ON DELETE CASCADE,
        channel message_jobs_channel_enum NOT NULL, payload_ciphertext text, status varchar NOT NULL DEFAULT 'QUEUED',
        attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL, locked_until timestamptz,
        expires_at timestamptz NOT NULL, sent_at timestamptz, last_error varchar, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_retry_idx ON message_jobs(status,next_attempt_at);
      CREATE TABLE user_addresses (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        label varchar(60) NOT NULL DEFAULT 'Current location', address_text text NOT NULL,
        latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE trips (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), customer_id uuid NOT NULL REFERENCES users(id), status varchar NOT NULL DEFAULT 'OPEN',
        package_description varchar(300) NOT NULL, vehicle_type trips_vehicle_type_enum NOT NULL, pickup_address text NOT NULL,
        destination_address text NOT NULL,
        pickup_latitude double precision NOT NULL CHECK (pickup_latitude BETWEEN -90 AND 90), pickup_longitude double precision NOT NULL CHECK (pickup_longitude BETWEEN -180 AND 180),
        destination_latitude double precision NOT NULL CHECK (destination_latitude BETWEEN -90 AND 90), destination_longitude double precision NOT NULL CHECK (destination_longitude BETWEEN -180 AND 180),
        recipient_name varchar(80) NOT NULL, recipient_phone varchar(20) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX trips_status_idx ON trips(status); CREATE INDEX trips_pickup_idx ON trips(pickup_latitude);
    `);
  }
  down(): Promise<void> {
    throw new Error(
      'Initial schema contains user data. Restore a reviewed backup instead of automatically dropping it.',
    );
  }
}
