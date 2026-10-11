'use client';

/**
 * TradingView Advanced Chart widget (official free widget embed).
 *
 * Disclosure: the free widget ships with TradingView's own market data, which is
 * delayed (or demo) for many symbols depending on entitlements. ARJUN does not
 * claim to provide TradingView's licensed datafeed; connect a licensed datafeed
 * (TV_DATAFEED_URL) for a fully authorized professional setup.
 */
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView?: any;
  }
}

const TV_SCRIPT = 'https://s3.tradingview.com/tv.js';

let scriptPromise: Promise<void> | null = null;
function loadTvScript(): Promise<void> {
  if (window.TradingView) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TV_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load TradingView widget script'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function TradingViewWidget({
  symbol,
  interval = '60',
  containerId = 'arjun-tv-chart',
}: {
  symbol: string;
  interval?: string;
  containerId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const mount = async () => {
      try {
        await loadTvScript();
        if (cancelled || !ref.current || !window.TradingView) return;
        ref.current.innerHTML = '';
        widgetRef.current = new window.TradingView.widget({
          container_id: containerId,
          autosize: true,
          symbol,
          interval,
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#071f16',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false,
          hide_legend: false,
          withdateranges: true,
          details: true,
          hotlist: false,
          calendar: false,
          news: [],
          studies: [],
          disabled_features: ['header_symbol_search'],
          enabled_features: ['study_templates'],
          overrides: {
            'paneProperties.background': '#04120c',
            'paneProperties.backgroundType': 'solid',
            'mainSeriesProperties.candleStyle.upColor': '#34d399',
            'mainSeriesProperties.candleStyle.downColor': '#fb7185',
            'mainSeriesProperties.candleStyle.borderUpColor': '#34d399',
            'mainSeriesProperties.candleStyle.borderDownColor': '#fb7185',
            'mainSeriesProperties.candleStyle.wickUpColor': '#34d399',
            'mainSeriesProperties.candleStyle.wickDownColor': '#fb7185',
            'scalesProperties.textColor': '#8fb8a5',
          },
        });
      } catch (e) {
        console.error('[tv]', e);
      }
    };
    void mount();
    return () => {
      cancelled = true;
      try {
        widgetRef.current?.remove?.();
      } catch {
        /* ignore */
      }
      widgetRef.current = null;
    };
  }, [symbol, interval, containerId]);

  return <div ref={ref} id={containerId} className="h-full w-full" />;
}
