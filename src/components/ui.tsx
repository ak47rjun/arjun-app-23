/**
 * ARJUN design system — SERVER-SAFE primitives.
 * This module must NOT have 'use client' and must not import framer-motion or
 * use hooks: server components (dashboard, journal/[id], profiles/[id], s/[token])
 * pass icon components as props (e.g. <StatCard icon={Wallet} />), which only
 * works when the receiving component stays on the server. The animated Modal
 * lives in ./ui/modal.tsx ('use client') and is re-exported below.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, X, AlertTriangle, PlugZap } from 'lucide-react';
import { cn } from '@/lib/cn';

// ───────────────────────────── Button ─────────────────────────────

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-glow hover:from-emerald-500 hover:to-emerald-400 hover:shadow-glow-lg',
        secondary: 'border border-arjun-line bg-white/[0.04] text-arjun-text hover:bg-white/[0.08] hover:border-emerald-500/40',
        ghost: 'text-arjun-muted hover:text-arjun-text hover:bg-white/[0.05]',
        danger: 'bg-rose-600/80 text-white hover:bg-rose-500/80',
        icon: 'p-2 rounded-lg text-arjun-muted hover:text-arjun-text hover:bg-white/[0.06]',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-base',
        icon: 'p-2',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';

// ───────────────────────────── Inputs ─────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('input', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('input min-h-[90px] resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('label', className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input appearance-none bg-black/30', className)} {...props}>
      {children}
    </select>
  );
}

export function Switch({ checked, onCheckedChange, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? 'bg-emerald-500' : 'bg-white/10 border border-arjun-line',
        className,
      )}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

// ───────────────────────────── Card ─────────────────────────────

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>;
}
export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mb-4 flex items-center justify-between gap-2', className)}>{children}</div>;
}
export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn('font-display text-lg font-semibold text-arjun-text', className)}>{children}</h3>;
}
export function CardDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn('text-sm text-arjun-muted', className)}>{children}</p>;
}
export function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn(className)}>{children}</div>;
}

// ───────────────────────────── Badge / Avatar ─────────────────────────────

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      neutral: 'bg-white/5 text-arjun-muted border border-arjun-line',
      success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
      warn: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      cyan: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, children }: { className?: string; variant?: VariantProps<typeof badgeVariants>['variant']; children: React.ReactNode }) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

export function Avatar({ src, name, size = 36, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-gradient-to-br from-emerald-900 to-arjun-bg2 font-semibold text-emerald-200', className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? <img src={src} alt={name ?? ''} className="h-full w-full rounded-full object-cover" /> : initials}
    </div>
  );
}

// ───────────────────────────── Feedback ─────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function Spinner({ className, size = 18 }: { className?: string; size?: number }) {
  return <Loader2 className={cn('animate-spin text-emerald-400', className)} size={size} />;
}

export function EmptyState({
  icon: Icon = AlertTriangle,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-arjun-line py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
        <Icon size={26} className="text-emerald-300" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="max-w-md text-sm text-arjun-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Clearly-labelled state for integrations whose credentials are not configured. */
export function SetupRequired({
  title,
  description,
  docs,
  className,
}: {
  title: string;
  description: string;
  docs?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/25">
        <PlugZap size={26} className="text-amber-300" />
      </div>
      <h3 className="font-display text-lg font-semibold text-amber-100">{title}</h3>
      <p className="max-w-lg text-sm text-arjun-muted">{description}</p>
      {docs && (
        <code className="rounded-lg border border-arjun-line bg-black/40 px-3 py-1.5 font-mono text-xs text-arjun-muted">{docs}</code>
      )}
    </div>
  );
}

// ───────────────────────────── Modal ─────────────────────────────
// Animated modal (framer-motion) — client component, re-exported here so
// existing imports from '@/components/ui' keep working.
export { Modal } from './ui/modal';

// ───────────────────────────── Stat / misc ─────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn('card relative overflow-hidden', className)}>
      <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-arjun-muted">{label}</span>
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
              <Icon size={16} />
            </span>
          )}
        </div>
        <div className={cn('mt-2 font-mono text-2xl font-semibold tracking-tight', trend === 'up' && 'text-emerald-300', trend === 'down' && 'text-rose-300')}>
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-arjun-muted">{sub}</div>}
      </div>
    </div>
  );
}

export function PriceChange({ value, percent, className }: { value: number; percent?: number; className?: string }) {
  const up = value >= 0;
  return (
    <span className={cn('font-mono text-sm', up ? 'text-emerald-300' : 'text-rose-300', className)}>
      {up ? '+' : ''}
      {value.toFixed(2)}
      {percent !== undefined && ` (${up ? '+' : ''}${percent.toFixed(2)}%)`}
    </span>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-arjun-line', className)} />;
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 rounded-xl border border-arjun-line bg-white/[0.03] p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
            value === t.id ? 'bg-emerald-500/15 text-emerald-200 shadow-glow' : 'text-arjun-muted hover:text-arjun-text',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-white/10 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions, className }: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-arjun-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
