/* ARJUN seed: instruments + development admin. Run: npm run db:seed */
// Load .env first: the Prisma CLI does this itself, but `tsx` does not, so
// without this line `npm run db:seed` fails on a fresh checkout with
// "Environment variable not found: DATABASE_URL". dotenv never overrides
// variables that are already set, so real deployment env vars still win.
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

const INSTRUMENTS = [
  // forex (contract size 100_000)
  { symbol: 'EURUSD', name: 'Euro / US Dollar', type: 'forex', currency: 'USD', contractSize: '100000', digits: 5, tickSize: '0.00001', baseCurrency: 'EUR', quoteCurrency: 'USD' },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', type: 'forex', currency: 'USD', contractSize: '100000', digits: 5, tickSize: '0.00001', baseCurrency: 'GBP', quoteCurrency: 'USD' },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', type: 'forex', currency: 'JPY', contractSize: '100000', digits: 3, tickSize: '0.001', baseCurrency: 'USD', quoteCurrency: 'JPY' },
  { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar', type: 'forex', currency: 'USD', contractSize: '100000', digits: 5, tickSize: '0.00001', baseCurrency: 'AUD', quoteCurrency: 'USD' },
  { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', type: 'forex', currency: 'CAD', contractSize: '100000', digits: 5, tickSize: '0.00001', baseCurrency: 'USD', quoteCurrency: 'CAD' },
  { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc', type: 'forex', currency: 'CHF', contractSize: '100000', digits: 5, tickSize: '0.00001', baseCurrency: 'USD', quoteCurrency: 'CHF' },
  // indices (contract size 1)
  { symbol: 'US500', name: 'S&P 500 Index', type: 'index', exchange: 'NYSE', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.25' },
  { symbol: 'NAS100', name: 'Nasdaq 100 Index', type: 'index', exchange: 'NASDAQ', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.25' },
  { symbol: 'GER40', name: 'DAX Index', type: 'index', exchange: 'XETRA', currency: 'EUR', contractSize: '1', digits: 2, tickSize: '0.5' },
  { symbol: 'UK100', name: 'FTSE 100 Index', type: 'index', exchange: 'LSE', currency: 'GBP', contractSize: '1', digits: 2, tickSize: '0.5' },
  { symbol: 'JPN225', name: 'Nikkei 225', type: 'index', exchange: 'TSE', currency: 'JPY', contractSize: '1', digits: 0, tickSize: '1' },
  // commodities
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', type: 'commodity', exchange: 'COMEX', currency: 'USD', contractSize: '100', digits: 2, tickSize: '0.01', baseCurrency: 'XAU', quoteCurrency: 'USD' },
  { symbol: 'XAGUSD', name: 'Silver / US Dollar', type: 'commodity', exchange: 'COMEX', currency: 'USD', contractSize: '5000', digits: 3, tickSize: '0.001', baseCurrency: 'XAG', quoteCurrency: 'USD' },
  { symbol: ' USOIL', name: 'WTI Crude Oil', type: 'commodity', exchange: 'NYMEX', currency: 'USD', contractSize: '1000', digits: 2, tickSize: '0.01' },
  // crypto (contract size 1)
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', type: 'crypto', exchange: 'Crypto', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01', baseCurrency: 'BTC', quoteCurrency: 'USD' },
  { symbol: 'ETHUSD', name: 'Ethereum / US Dollar', type: 'crypto', exchange: 'Crypto', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01', baseCurrency: 'ETH', quoteCurrency: 'USD' },
  { symbol: 'SOLUSD', name: 'Solana / US Dollar', type: 'crypto', exchange: 'Crypto', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01', baseCurrency: 'SOL', quoteCurrency: 'USD' },
  // stocks
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', exchange: 'NASDAQ', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', exchange: 'NASDAQ', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', exchange: 'NASDAQ', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', exchange: 'NASDAQ', currency: 'USD', contractSize: '1', digits: 2, tickSize: '0.01' },
];

async function main() {
  for (const i of INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { symbol: i.symbol.trim() },
      update: {},
      create: { ...i, symbol: i.symbol.trim() },
    });
  }
  console.log(`Seeded ${INSTRUMENTS.length} instruments`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@arjun.local';
  // No hardcoded default: if ADMIN_PASSWORD is unset, generate a strong random
  // password and print it exactly once (never commit a default admin password).
  const adminPassword =
    process.env.ADMIN_PASSWORD ||
    (() => {
      const generated = `Arjun-${crypto.randomBytes(18).toString('base64url')}`;
      console.log(`\n⚠️  ADMIN_PASSWORD is not set — generated a random admin password (shown once):\n   ${generated}\n   Set ADMIN_PASSWORD in .env to make it stable across re-seeds.\n`);
      return generated;
    })();
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        displayName: 'ARJUN Admin',
        name: 'ARJUN Admin',
        emailVerified: new Date(),
        role: Role.ADMIN,
        profile: { create: { onboardingDone: true, isPublic: false } },
        settings: { create: {} },
        notificationPrefs: { create: {} },
      },
    });
    console.log(`Seeded admin: ${adminEmail} (password from ADMIN_PASSWORD env)`);
  } else if (process.env.ADMIN_PASSWORD) {
    // Repair runbook: when ADMIN_PASSWORD is explicitly set, re-seeding keeps the
    // admin credential in sync with the env (fixes drift after env changes).
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.update({ where: { email: adminEmail }, data: { passwordHash } });
    console.log(`Admin password reset to the ADMIN_PASSWORD env value: ${adminEmail}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
