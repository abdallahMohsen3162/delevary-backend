import { runIntegration } from '../src/tests/postgres.integration';

describe('API with PostgreSQL 17', () => {
  it('verifies accounts, separates roles, saves locations, finds orders, and recovers passwords', async () => {
    await runIntegration();
  }, 90_000);
});
