import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CandlestickChart,
  Check,
  Globe2,
  MessagesSquare,
  ShieldCheck,
  Users,
  Video,
  Wallet,
  Zap,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';

const GlobeCanvas = dynamicImport(
  () => import('@/components/landing/globe').then((m) => m.GlobeCanvas),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-3xl bg-emerald-950/20" /> },
);

// Rotating 3D Earth + candlesticks behind the whole site (fixed background layer)
const EarthBackground = dynamicImport(
  () => import('@/components/landing/earth-background').then((m) => m.EarthBackground),
  { ssr: false, loading: () => <div className="absolute inset-0 bg-emerald-950/20" /> },
);

export const dynamic = 'force-dynamic';

async function getStats() {
  const [members, trades, posts, groups] = await Promise.all([
    prisma.user.count({ where: { isBanned: false } }),
    prisma.trade.count(),
    prisma.post.count({ where: { deletedAt: null } }),
    prisma.group.count({ where: { visibility: 'PUBLIC' } }),
  ]);
  return { members, trades, posts, groups };
}

const FEATURES = [
  {
    icon: CandlestickChart,
    title: 'Pro Trading Terminal',
    description: 'Professional charting with drawing tools, multiple timeframes, saved layouts and one-click chart sharing.',
  },
  {
    icon: BookOpen,
    title: 'Trading Journal & Analytics',
    description: 'Log every trade with screenshots, emotions and lessons. Win rate, profit factor, expectancy, drawdown and equity curves — computed from your real records.',
  },
  {
    icon: Wallet,
    title: 'MT5 Account Analytics',
    description: 'Connect your MetaTrader 5 account read-only and synchronize balances, equity and full trade history straight into your journal.',
  },
  {
    icon: MessagesSquare,
    title: 'ARJUN Messenger',
    description: 'Real-time DMs and groups with typing indicators, read receipts, reactions, attachments and chart sharing — built for traders.',
  },
  {
    icon: Video,
    title: 'ARJUN Meet',
    description: 'Instant and scheduled video meetings with screen sharing, built on LiveKit — mentor sessions and team standups inside the platform.',
  },
  {
    icon: Users,
    title: 'Trader Community',
    description: 'Follow traders, share analysis, join strategy groups. Verified badges and moderation keep the community trustworthy.',
  },
];

export default async function LandingPage() {
  const stats = await getStats();

  return (
    <main className="relative overflow-x-hidden">
      {/* ── 3D background: rotating Earth + candlesticks behind the site ── */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-80" aria-hidden="true">
        <div className="absolute inset-0">
          <EarthBackground />
        </div>
        {/* vignette + top/bottom fades keep text readable over the scene */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,8,6,0.45)_62%,rgba(2,8,6,0.88)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(4,12,10,0.9),transparent_26%,transparent_72%,rgba(4,12,10,0.92))]" />
      </div>

      {/* ── Nav ── */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-arjun-line/60 bg-arjun-bg/60 backdrop-blur-glass">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white shadow-glow">
              A
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-gradient">ARJUN</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-arjun-muted md:flex">
            <a href="#features" className="hover:text-arjun-text">Features</a>
            <a href="#platform" className="hover:text-arjun-text">Platform</a>
            <Link href="/login" className="hover:text-arjun-text">Sign in</Link>
            <Link href="/login?next=%2Fadmin" className="hover:text-arjun-text">Admin</Link>
            <Link href="/register" className="btn-primary !py-2">Get started</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 flex min-h-screen items-center pt-16">
        <div className="pointer-events-none absolute inset-0 bg-aurora" />
        <div className="pointer-events-none absolute inset-0 bg-aurora-2" />
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-6 lg:grid-cols-2">
          <div className="relative z-10 animate-fade-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              The global network for serious traders
            </div>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Trade with clarity.
              <br />
              <span className="text-gradient">Grow together.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-arjun-muted">
              ARJUN combines a professional trading terminal, a performance journal, MT5 analytics, a trader
              messenger and video meetings — wrapped in a cinematic, dark-emerald interface built for focus.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className="btn-primary">
                Create free account <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-arjun-muted">
              <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-400" /> Free to start</span>
              <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-400" /> Google sign-in</span>
              <span className="flex items-center gap-1.5"><Check size={14} className="text-emerald-400" /> Your data stays yours</span>
            </div>
          </div>

          {/* 3D globe */}
          <div className="relative h-[520px] w-full lg:h-[640px]">
            <div className="absolute inset-0 rounded-3xl border border-emerald-500/15 bg-gradient-to-b from-emerald-950/30 to-transparent shadow-glow-lg">
              <GlobeCanvas symbols={['EURUSD', 'BTCUSD', 'XAUUSD']} />
            </div>
            <div className="absolute left-4 top-4 rounded-full border border-arjun-line bg-black/50 px-3 py-1 text-[11px] text-arjun-muted backdrop-blur-glass">
              Arjun Madhavrao Shinde · Owner
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-arjun-line bg-black/50 px-4 py-1.5 text-xs text-arjun-muted backdrop-blur-glass">
              Drag to rotate · Live trader network
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="absolute inset-x-0 bottom-0 border-t border-arjun-line/60 bg-arjun-bg/60 backdrop-blur-glass">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 py-5 text-center md:grid-cols-4">
            <Stat value={stats.members} label="Traders on ARJUN" />
            <Stat value={stats.trades} label="Trades journaled" />
            <Stat value={stats.posts} label="Analysis posts" />
            <Stat value={stats.groups} label="Communities" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight">
            Everything a serious trader needs. <span className="text-gradient">Nothing they don&apos;t.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-arjun-muted">
            One platform for charting, journaling, community and collaboration — with real security,
            real permissions and real data isolation between traders.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card group transition-all hover:border-emerald-500/35 hover:shadow-glow">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 transition-all group-hover:bg-emerald-500/20">
                <f.icon size={20} />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-arjun-muted">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Platform preview ── */}
      <section id="platform" className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="overflow-hidden rounded-3xl border border-arjun-line bg-arjun-panel/60 shadow-glass backdrop-blur-glass">
          <div className="grid gap-0 lg:grid-cols-5">
            <div className="col-span-2 border-b border-arjun-line p-8 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center gap-2 text-emerald-300">
                <Globe2 size={18} />
                <span className="text-xs font-semibold uppercase tracking-widest">The platform</span>
              </div>
              <h2 className="font-display text-3xl font-bold leading-tight">
                Your entire trading workflow, <span className="text-gradient">in one place.</span>
              </h2>
              <ul className="mt-6 space-y-3 text-sm text-arjun-muted">
                <li className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" /> Bank-grade auth: OAuth, 2FA, encrypted sessions and full audit trails</li>
                <li className="flex items-start gap-2"><Zap size={15} className="mt-0.5 shrink-0 text-emerald-400" /> Real-time messaging, presence and notifications over WebSockets</li>
                <li className="flex items-start gap-2"><BarChart3 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> Every dashboard metric computed from your own stored records</li>
                <li className="flex items-start gap-2"><Users size={15} className="mt-0.5 shrink-0 text-emerald-400" /> Private by default — journals, messages and charts are never public unless you say so</li>
              </ul>
              <Link href="/register" className="btn-primary mt-8">
                Start building your edge <ArrowRight size={16} />
              </Link>
            </div>
            <div className="relative col-span-3 min-h-[320px] bg-gradient-to-br from-emerald-950/40 to-arjun-bg p-6">
              {/* stylised dashboard preview */}
              <div className="grid h-full grid-cols-2 gap-3">
                <PreviewCard title="Equity" value="$128,440" delta="+12.4%" />
                <PreviewCard title="Win rate" value="64.2%" delta="312 trades" />
                <div className="card col-span-2 flex items-end gap-1 p-4">
                  {Array.from({ length: 28 }).map((_, i) => {
                    const h = 20 + ((i * 37) % 70);
                    const up = i % 3 !== 0;
                    return <div key={i} className={`w-full rounded-sm ${up ? 'bg-emerald-500/50' : 'bg-rose-500/40'}`} style={{ height: `${h}%` }} />;
                  })}
                </div>
              </div>
              <div className="absolute right-4 top-4 rounded-full border border-arjun-line bg-black/50 px-3 py-1 text-[10px] uppercase tracking-wider text-arjun-muted backdrop-blur-glass">
                Preview · your real data appears here
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/60 to-arjun-bg p-12 text-center shadow-glow-lg">
          <div className="pointer-events-none absolute inset-0 bg-aurora" />
          <h2 className="relative font-display text-4xl font-bold tracking-tight">
            Ready to trade with <span className="text-gradient">an edge?</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-arjun-muted">
            Join ARJUN free. Connect your accounts, journal every trade, and grow with a community of serious traders.
          </p>
          <div className="relative mt-8 flex justify-center gap-3">
            <Link href="/register" className="btn-primary">Create free account <ArrowRight size={16} /></Link>
            <Link href="/login" className="btn-ghost">Sign in</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-arjun-line bg-arjun-bg2/60">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 font-display font-bold text-white">A</div>
              <div>
                <div className="font-display font-bold text-gradient">ARJUN</div>
                <div className="text-[11px] text-arjun-muted">The Real Trader&apos;s Hub</div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-arjun-muted">
              <Link href="/login" className="hover:text-arjun-text">Sign in</Link>
              <Link href="/register" className="hover:text-arjun-text">Register</Link>
              <a href="#features" className="hover:text-arjun-text">Features</a>
            </div>
          </div>
          <p className="mt-8 text-center text-xs leading-relaxed text-arjun-muted">
            Risk disclosure: Trading financial instruments involves substantial risk of loss and is not suitable for every
            investor. Past performance is not indicative of future results. ARJUN is a trading journal, analytics and community
            platform — it is not a broker, and nothing on the platform is financial advice.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold text-arjun-text">{value.toLocaleString()}</div>
      <div className="text-xs uppercase tracking-wider text-arjun-muted">{label}</div>
    </div>
  );
}

function PreviewCard({ title, value, delta }: { title: string; value: string; delta: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-arjun-muted">{title}</div>
      <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
      <div className="text-xs text-emerald-300">{delta}</div>
    </div>
  );
}
