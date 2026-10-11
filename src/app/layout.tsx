import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: "ARJUN — The Real Trader's Hub",
  description:
    'ARJUN is a premium trading ecosystem: professional charting, a trading journal, MT5 analytics, a trader messenger, community and video meetings — in a cinematic dark-emerald interface.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-arjun-bg text-arjun-text font-sans antialiased">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          richColors
          toastOptions={{
            style: {
              background: 'rgba(7, 31, 22, 0.92)',
              border: '1px solid rgba(52, 211, 153, 0.18)',
              color: '#e9f7f0',
              backdropFilter: 'blur(16px)',
            },
          }}
        />
      </body>
    </html>
  );
}
