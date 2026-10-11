-- AlterTable: EA (Expert Advisor) push mode — the terminal pushes data to ARJUN,
-- so no investor password is stored and no bridge is required.
ALTER TABLE "Mt5Connection" ALTER COLUMN "investorPasswordEnc" DROP NOT NULL;
ALTER TABLE "Mt5Connection" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'BRIDGE';
ALTER TABLE "Mt5Connection" ADD COLUMN "syncTokenHash" TEXT;

-- IndexTable
CREATE INDEX "Mt5Connection_syncTokenHash_idx" ON "Mt5Connection"("syncTokenHash");
