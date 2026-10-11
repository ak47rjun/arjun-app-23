'use client';

/** Animated modal — client-only (framer-motion). Re-exported from ui.tsx. */
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className={cn('relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-arjun-line bg-arjun-panel/95 p-6 shadow-glass backdrop-blur-glass', className)}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                {title && <h2 className="font-display text-xl font-semibold">{title}</h2>}
                {description && <p className="mt-1 text-sm text-arjun-muted">{description}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-arjun-muted hover:bg-white/5 hover:text-arjun-text" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
