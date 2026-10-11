/**
 * Scheduled-jobs endpoint.
 *
 * The background job runner (MT5 sync, watchlist price alerts, meeting
 * reminders) normally lives inside the custom Node server's setInterval loop.
 * Serverless platforms such as Vercel have no long-lived process, so instead a
 * platform cron hits this endpoint on a schedule.
 *
 * Security: when CRON_SECRET is configured, requests must present it as
 * `Authorization: Bearer <secret>` (Vercel Cron sends exactly that) or as a
 * `x-cron-secret` header. If CRON_SECRET is empty the endpoint refuses to run
 * rather than exposing a public job trigger.
 */
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runAllJobsOnce } from '@/server/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}

async function handle(req: Request): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'NOT_CONFIGURED', message: 'Set CRON_SECRET to enable the scheduled-jobs endpoint.' },
      { status: 503 },
    );
  }

  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const headerSecret = req.headers.get('x-cron-secret');
  if (bearer !== env.CRON_SECRET && headerSecret !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    await runAllJobsOnce();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (e) {
    console.error('[jobs] scheduled run failed', e);
    return NextResponse.json(
      { error: 'JOB_RUN_FAILED', message: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
