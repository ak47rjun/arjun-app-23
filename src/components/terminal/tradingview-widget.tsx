'use client';

/**
 * TradingView Advanced Chart widget (official free embed).
 *
 * Disclosure: the free widget ships with TradingView's own market data, which is
 * delayed (or demo) for many symbols depending on entitlements. ARJUN does not
 * claim to provide TradingView's licensed datafeed; connect a licensed datafeed
 * (TV_DATAFEED_URL) for a fully authorized professional setup.
 *
 * ── Why this uses the embed script and not `s3.tradingview.com/tv.js` ──
 * The previous implementation loaded `tv.js` and called
 * `new window.TradingView.widget({ container_id, ... })`. That is the legacy
 * Charting Library entry point: on its own it has no datafeed, and it now boots
 * into the modern widget bundle that expects the embed plumbing — it threw
 * "Cannot read properties of undefined (reading 'list')" and rendered nothing,
 * so the chart was permanently blank.
 *
 * The supported free embed (`external-embedding/embed-widget-advanced-chart.js`)
 * works differently and needs a precise DOM contract:
 *   • the <script> element's PARENT must carry the class
 *     `tradingview-widget-container`;
 *   • that parent must contain a child with the class
 *     `tradingview-widget-container__widget`, which the script REPLACES with
 *     its iframe;
 *   • the configuration is read from the script element's own text content
 *     (JSON), via document.currentScript — so a brand-new <script> node must be
 *     appended on every mount. Note `container_id` is accepted in the config but
 *     is NOT used to locate the container.
 */
import { useEffect, useRef } from 'react';

const TV_EMBED_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

const WIDGET_PLACEHOLDER =
  '<div class="tradingview-widget-container__widget" style="width:100%;height:100%"></div>';

export function TradingViewWidget({
  symbol,
  interval = '60',
}: {
  symbol: string;
  interval?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // The embed REPLACES the placeholder node with its iframe, so the
    // placeholder has to be rebuilt on every mount / symbol / interval change.
    container.innerHTML = WIDGET_PLACEHOLDER;

    const script = document.createElement('script');
    script.src = TV_EMBED_SRC;
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      hide_legend: false,
      withdateranges: true,
      details: true,
      hotlist: false,
      studies: [],
      backgroundColor: '#04120c',
      gridColor: 'rgba(255,255,255,0.04)',
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

    script.onerror = () => {
      container.innerHTML =
        '<div style="display:flex;height:100%;align-items:center;justify-content:center;' +
        'padding:1rem;text-align:center;font-size:12px;color:#8fb8a5">' +
        'Chart could not load. Check your connection, or that s3.tradingview.com is reachable.</div>';
    };

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, interval]);

  return <div ref={ref} className="tradingview-widget-container h-full w-full" />;
}
