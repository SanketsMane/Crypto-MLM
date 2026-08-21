import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
    // Needed by `prisma migrate diff --from-migrations`, which CI runs to catch
    // a schema.prisma edited without a matching migration — the drift that
    // works locally and then fails on deploy.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
