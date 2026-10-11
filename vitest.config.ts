// Load .env before any test module is imported. Several suites pull in
// @/lib/prisma or @/lib/env at import time, which throws when DATABASE_URL /
// AUTH_SECRET are missing — that made `npm test` fail on a fresh checkout even
// though every individual test passed. dotenv never overrides existing vars.
import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
