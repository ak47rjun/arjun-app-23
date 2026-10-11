/**
 * Background job runner (in-process, DB-coordinated). Production deployments can
 * move the same handlers to BullMQ — the handler registry stays identical.
 *
 * Jobs:
 *  - MT5_SYNC / MT5_HISTORY: read-only MT5 account synchronization (via bridge)
 *  - scheduled watchlist price alerts
 *  - meeting reminders
 */
import { prisma } from '../lib/prisma';
import { runMt5SyncJob } from '../lib/mt5/sync';
import { getMarketProvider } from '../lib/market/provider';
import { createNotification } from '../lib/notifications/service';
import { SyncJobStatus, SyncJobType, type SyncJob, type Mt5Connection } from '@prisma/client';

type JobHandler = (job: SyncJob & { connection: Mt5Connection | null }) => Promise<unknown>;

const handlers = new Map<SyncJobType, JobHandler>();

export function registerJobHandler(type: SyncJobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

registerJobHandler(SyncJobType.MT5_SYNC, runMt5SyncJob);
registerJobHandler(SyncJobType.MT5_HISTORY, runMt5SyncJob);

async function processPendingJobs(): Promise<void> {
  const jobs = await prisma.syncJob.findMany({
    where: { status: SyncJobStatus.PENDING },
    include: { connection: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  const due = jobs.filter((j) => j.attempts < j.maxAttempts);

  for (const job of due) {
    const handler = handlers.get(job.type);
    if (!handler) continue;
    await prisma.syncJob.update({ where: { id: job.id }, data: { status: SyncJobStatus.RUNNING, startedAt: new Date(), attempts: { increment: 1 } } });
    try {
      const result = await handler(job);
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: SyncJobStatus.SUCCESS, finishedAt: new Date(), lastError: null, payload: (result ?? {}) as object },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      const willRetry = job.attempts + 1 < job.maxAttempts;
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: willRetry ? SyncJobStatus.PENDING : SyncJobStatus.FAILED,
          finishedAt: new Date(),
          lastError: message,
        },
      });
      // surface sync failures to the user (deduplicated per job)
      await createNotification({
        userId: job.userId,
        type: 'SYNC_FAILURE',
        title: 'MT5 synchronization failed',
        body: message,
        data: { jobId: job.id, connectionId: job.connectionId ?? undefined },
      });
      if (job.connectionId) {
        await prisma.mt5Connection.update({
          where: { id: job.connectionId },
          data: { status: 'ERROR', lastError: message },
        });
      }
    }
  }
}

async function checkWatchlistAlerts(): Promise<void> {
  const alerts = await prisma.watchlistItem.findMany({
    where: { alertEnabled: true, OR: [{ alertAbove: { not: null } }, { alertBelow: { not: null } }] },
    include: { instrument: true, watchlist: true },
  });
  if (alerts.length === 0) return;
  const provider = getMarketProvider();
  const symbols = [...new Set(alerts.map((a) => a.instrument.symbol))];
  let quotes;
  try {
    quotes = await provider.getQuotes(symbols);
  } catch {
    return;
  }
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  for (const item of alerts) {
    const quote = bySymbol.get(item.instrument.symbol);
    if (!quote) continue;
    const hitAbove = item.alertAbove !== null && quote.last >= Number(item.alertAbove);
    const hitBelow = item.alertBelow !== null && quote.last <= Number(item.alertBelow);
    if (!hitAbove && !hitBelow) continue;
    if (item.lastAlertAt && Date.now() - item.lastAlertAt.getTime() < 60 * 60 * 1000) continue;
    await prisma.watchlistItem.update({ where: { id: item.id }, data: { lastAlertAt: new Date() } });
    await createNotification({
      userId: item.watchlist.userId,
      type: 'ALERT',
      title: `Price alert: ${item.instrument.symbol}`,
      body: `${item.instrument.symbol} is at ${quote.last} (${hitAbove ? 'above' : 'below'} your alert ${hitAbove ? item.alertAbove : item.alertBelow})`,
      data: { symbol: item.instrument.symbol, price: quote.last },
    });
  }
}

async function sendMeetingReminders(): Promise<void> {
  const soon = new Date(Date.now() + 15 * 60 * 1000);
  const meetings = await prisma.meeting.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { gte: new Date(), lte: soon } },
    include: { participants: true },
  });
  for (const meeting of meetings) {
    for (const p of meeting.participants) {
      await createNotification({
        userId: p.userId,
        type: 'MEETING_INVITE',
        title: 'Meeting starting soon',
        body: `"${meeting.title}" starts in less than 15 minutes`,
        data: { meetingId: meeting.id, roomName: meeting.roomName },
      });
    }
  }
}

let running = false;

export function startJobRunner(): void {
  if (running) return;
  running = true;
  setInterval(() => {
    void processPendingJobs().catch((e) => console.error('[jobs] sync error', e));
  }, 5000);
  setInterval(() => {
    void checkWatchlistAlerts().catch((e) => console.error('[jobs] alerts error', e));
  }, 30000);
  setInterval(() => {
    void sendMeetingReminders().catch((e) => console.error('[jobs] reminders error', e));
  }, 60000);
  console.log('[jobs] background job runner started');
}
