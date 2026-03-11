export const DEFAULT_FEED_SYMBOLS = [
  'NEO-USD',
  'GAS-USD',
  '1000FLM-USD',
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'TRX-USD',
  'PAXG-USD',
  'WTI-USD',
  'BRENT-USD',
  'NATGAS-USD',
  'COPPER-USD',
  'WHEAT-USD',
  'CORN-USD',
  'SOY-USD',
  'USDT-USD',
  'USDC-USD',
  'BNB-USD',
  'XRP-USD',
  'DOGE-USD',
  'AAPL-USD',
  'GOOGL-USD',
  'MSFT-USD',
  'AMZN-USD',
  'TSLA-USD',
  'META-USD',
  'NVDA-USD',
  'SPY-USD',
  'QQQ-USD',
  'GLD-USD',
  'EUR-USD',
  'GBP-USD',
  '1000JPY-USD',
  'CNY-USD',
] as const;

const FEED_SYMBOL_ALIASES: Record<string, string> = {
  'FLM-USD': '1000FLM-USD',
  'JPY-USD': '1000JPY-USD',
};

export const FEED_DISPLAY_META: Record<string, { displaySymbol?: string; unitLabel?: string }> = {
  '1000FLM-USD': {
    displaySymbol: '1000FLM-USD',
    unitLabel: '1000 FLM',
  },
  '1000JPY-USD': {
    displaySymbol: '1000JPY-USD',
    unitLabel: '1000 JPY',
  },
};

export function normalizeFeedSymbol(symbol: string) {
  const normalized = String(symbol || '').trim().toUpperCase();
  return FEED_SYMBOL_ALIASES[normalized] || normalized;
}

export function getFeedDisplaySymbol(symbol: string) {
  return FEED_DISPLAY_META[normalizeFeedSymbol(symbol)]?.displaySymbol
    || normalizeFeedSymbol(symbol);
}

export function getFeedUnitLabel(symbol: string) {
  return FEED_DISPLAY_META[normalizeFeedSymbol(symbol)]?.unitLabel || '';
}

export function parseFeedSymbols(rawValue?: string | null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...DEFAULT_FEED_SYMBOLS];
  return raw.split(',').map((symbol) => normalizeFeedSymbol(symbol)).filter(Boolean);
}

export function parseFeedProviders(rawValue?: string | null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return ['twelvedata'];
  return raw.split(',').map((provider) => provider.trim().toLowerCase()).filter(Boolean);
}
