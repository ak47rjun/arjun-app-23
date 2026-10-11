/**
 * Loads .env into process.env before any other module parses the environment.
 * Imported FIRST by the custom server entrypoint (server.ts) — ES module
 * side effects run in import order, so this executes before src/lib/env.ts.
 * dotenv never overrides variables that are already set, so real production
 * environment variables always win. Next.js loads .env itself for pages and
 * route handlers, so this is only needed for the custom tsx server.
 */
import { config } from 'dotenv';

config();
