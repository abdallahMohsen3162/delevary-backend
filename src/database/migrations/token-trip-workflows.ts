import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TokenTripWorkflows1791700000000 implements MigrationInterface {
  name = 'TokenTripWorkflows1791700000000';
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
      DO $$ BEGIN
        IF to_regclass('auth_verifications') IS NULL AND to_regclass('verification') IS NOT NULL THEN
          ALTER TABLE verification RENAME TO auth_verifications;
        END IF;
      END $$;
      DROP TABLE IF EXISTS sessions;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='user_addresses' AND column_name='is_default') THEN
          ALTER TABLE user_addresses ADD COLUMN is_default boolean NOT NULL DEFAULT false;
          UPDATE user_addresses SET is_default=true;
        END IF;
      END $$;
      DO $$ DECLARE item record; BEGIN
        FOR item IN SELECT c.conname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
          WHERE c.conrelid='user_addresses'::regclass AND c.contype='u' AND array_length(c.conkey,1)=1 AND a.attname='user_id'
        LOOP EXECUTE format('ALTER TABLE user_addresses DROP CONSTRAINT %I',item.conname); END LOOP;
      END $$;
      CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default ON user_addresses(user_id) WHERE is_default=true;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES users(id);
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS client_request_id uuid;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS price_piasters integer;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS distance_meters integer;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS duration_seconds integer;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_geometry jsonb;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS quote_expires_at timestamptz;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS started_at timestamptz;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS delivery_instructions varchar(500) NOT NULL DEFAULT '';
      CREATE UNIQUE INDEX IF NOT EXISTS trips_create_idempotency ON trips(customer_id, client_request_id);
      CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_rider ON trips(rider_id) WHERE rider_id IS NOT NULL AND status NOT IN ('DELIVERED','CANCELLED','FAILED');
      CREATE INDEX IF NOT EXISTS trips_customer_history ON trips(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS trips_rider_history ON trips(rider_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS trip_status_history (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), trip_id uuid NOT NULL REFERENCES trips(id),
        from_status varchar, to_status varchar NOT NULL, changed_by uuid REFERENCES users(id), reason varchar(300),
        trip_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id,trip_version)
      );
      CREATE TABLE IF NOT EXISTS pricing_rules (
        vehicle_type varchar PRIMARY KEY, base_fee_piasters integer NOT NULL CHECK(base_fee_piasters>=0),
        per_km_piasters integer NOT NULL CHECK(per_km_piasters>=0), minimum_fee_piasters integer NOT NULL CHECK(minimum_fee_piasters>=0), active boolean NOT NULL DEFAULT true
      );
      INSERT INTO pricing_rules VALUES ('BICYCLE',1500,300,2000,true),('MOTORCYCLE',2000,400,2500,true),('CAR',3500,650,4000,true),('TUKTUK',2500,500,3000,true) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS trip_price_proposals (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), trip_id uuid NOT NULL REFERENCES trips(id),
        proposed_by uuid NOT NULL REFERENCES users(id), amount_piasters integer NOT NULL CHECK(amount_piasters>0),
        reason varchar(300), status varchar NOT NULL DEFAULT 'PENDING', expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS trip_proposals_lookup ON trip_price_proposals(trip_id,status);
      CREATE TABLE IF NOT EXISTS trip_messages (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), trip_id uuid NOT NULL REFERENCES trips(id),
        sender_id uuid NOT NULL REFERENCES users(id), client_message_id uuid NOT NULL, body varchar(2000) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id,sender_id,client_message_id)
      );
      CREATE INDEX IF NOT EXISTS trip_messages_history ON trip_messages(trip_id,created_at,id);
      CREATE TABLE IF NOT EXISTS trip_live_locations (
        trip_id uuid PRIMARY KEY REFERENCES trips(id), rider_id uuid NOT NULL REFERENCES users(id),
        update_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence>0),
        latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
        longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), accuracy double precision NOT NULL CHECK(accuracy BETWEEN 0 AND 200),
        recorded_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS trip_location_history (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), trip_id uuid NOT NULL REFERENCES trips(id),
        rider_id uuid NOT NULL REFERENCES users(id), latitude double precision NOT NULL, longitude double precision NOT NULL,
        accuracy double precision NOT NULL, recorded_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS trip_location_history_lookup ON trip_location_history(trip_id,recorded_at);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token_updated_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL REFERENCES users(id),
        trip_id uuid REFERENCES trips(id), type varchar(20) NOT NULL DEFAULT 'system',
        title varchar(150) NOT NULL, description text NOT NULL DEFAULT '',
        client_request_id uuid, read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id);
      ALTER TABLE notifications ALTER COLUMN trip_id DROP NOT NULL;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type varchar(20) NOT NULL DEFAULT 'system';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS client_request_id uuid;
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_client_request ON notifications(client_request_id);
      CREATE INDEX IF NOT EXISTS notifications_user_lookup ON notifications(user_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS notification_push_deliveries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, lease_id uuid,
        last_error_code varchar(100), provider_message_id text, sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS notification_push_one_per_notification ON notification_push_deliveries(notification_id);
      CREATE INDEX IF NOT EXISTS notification_push_due ON notification_push_deliveries(status,next_attempt_at);
      CREATE OR REPLACE FUNCTION enforce_trip_transition() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status IN ('DELIVERED','CANCELLED','FAILED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Terminal trip is immutable'; END IF;
        IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL AND NOT (OLD.status='ASSIGNED' AND NEW.status='ARRIVING_PICKUP') THEN RAISE EXCEPTION 'Trip must start by heading to pickup'; END IF;
        IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'started_at is immutable'; END IF;
        IF NEW.status='CANCELLED' AND NEW.started_at IS NOT NULL THEN RAISE EXCEPTION 'TRIP_ALREADY_STARTED'; END IF;
        IF OLD.status <> 'DRAFT' AND ROW(NEW.pickup_address,NEW.destination_address,NEW.pickup_latitude,NEW.pickup_longitude,NEW.destination_latitude,NEW.destination_longitude,NEW.recipient_name,NEW.recipient_phone,NEW.vehicle_type)
          IS DISTINCT FROM ROW(OLD.pickup_address,OLD.destination_address,OLD.pickup_latitude,OLD.pickup_longitude,OLD.destination_latitude,OLD.destination_longitude,OLD.recipient_name,OLD.recipient_phone,OLD.vehicle_type) THEN RAISE EXCEPTION 'Published trip locations and recipient are immutable'; END IF;
        IF NEW.status<>OLD.status AND NOT (
          (OLD.status='DRAFT' AND NEW.status IN ('OPEN','CANCELLED')) OR
          (OLD.status='OPEN' AND NEW.status IN ('ASSIGNED','CANCELLED')) OR
          (OLD.status='ASSIGNED' AND NEW.status IN ('ARRIVING_PICKUP','CANCELLED')) OR
          (OLD.status='ARRIVING_PICKUP' AND NEW.status='AT_PICKUP') OR
          (OLD.status='AT_PICKUP' AND NEW.status='PICKED_UP') OR
          (OLD.status='PICKED_UP' AND NEW.status='IN_TRANSIT') OR
          (OLD.status='IN_TRANSIT' AND NEW.status='AT_DESTINATION') OR
          (OLD.status='AT_DESTINATION' AND NEW.status='DELIVERED')
        ) THEN RAISE EXCEPTION 'Invalid trip transition'; END IF;
        IF NEW.status='ARRIVING_PICKUP' AND NEW.started_at IS NULL THEN RAISE EXCEPTION 'Trip start timestamp required'; END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS trips_transition_policy ON trips;
      CREATE TRIGGER trips_transition_policy BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION enforce_trip_transition();
    `);
  }
  down(): Promise<void> {
    throw new Error(
      'Forward-only migration: preserve trips and restore a reviewed backup if needed.',
    );
  }
}
