import 'dotenv/config';
import { config } from 'dotenv';

// Load .env.test FIRST and let it win, so a stray dev DATABASE_URL can never
// point the suite at real data.
config({ path: '.env.test', override: true });

if (!/fortunex_test/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL is not the test database (${process.env.DATABASE_URL}). ` +
    'Tests truncate tables — this guard exists so that can never happen to dev or production data.',
  );
}
