import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VerificationRename1791600000000 implements MigrationInterface {
  name = 'VerificationRename1791600000000';
  async up(runner: QueryRunner) {
    // Renames auth_challenges to verification and stores the OTP code itself
    // instead of a hash. Every statement is guarded so fresh databases (whose
    // baseline already creates verification) apply this as a no-op.
    // Pending challenges are short-lived (5-minute expiry); their rows are
    // cleared because old code_hash digests cannot become 6-digit codes.
    await runner.query(`ALTER TABLE IF EXISTS auth_challenges RENAME TO verification;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'verification' AND column_name = 'code_hash') THEN
          ALTER TABLE verification RENAME COLUMN code_hash TO code;
        END IF;
      END $$;
      DELETE FROM verification;
      ALTER TABLE verification ALTER COLUMN code TYPE varchar(6);
      ALTER INDEX IF EXISTS challenges_rate_idx RENAME TO verification_rate_idx;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_challenges_role_enum') THEN
          ALTER TYPE auth_challenges_role_enum RENAME TO verification_role_enum;
        END IF;
      END $$;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_challenges_purpose_enum') THEN
          ALTER TYPE auth_challenges_purpose_enum RENAME TO verification_purpose_enum;
        END IF;
      END $$;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_challenges_channel_enum') THEN
          ALTER TYPE auth_challenges_channel_enum RENAME TO verification_channel_enum;
        END IF;
      END $$;
    `);
  }
  down(): Promise<void> {
    throw new Error(
      'Verification rename contains user data. Restore a reviewed backup instead of automatically dropping it.',
    );
  }
}
