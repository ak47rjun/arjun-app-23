import { json, withApi } from '@/lib/api';
import { mt5BridgeConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic'; // API routes read cookies/headers — never prerender

/** MT5 status: bridge configuration + EA push-mode availability. */
export const GET = withApi(async () => {
  return json({
    bridgeConfigured: mt5BridgeConfigured,
    eaAvailable: true, // EA push mode needs no server-side configuration
    message: mt5BridgeConfigured
      ? 'MT5 connector bridge is configured. Expert Advisor mode is also available.'
      : 'MT5 bridge is not configured — use Expert Advisor mode (recommended): connect, download the EA, and attach it in your terminal. No bridge or investor password needed.',
  });
});
