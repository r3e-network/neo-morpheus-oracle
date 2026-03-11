export const DEFAULT_FEED_SYMBOLS = [
  'NEO-USD',
  'GAS-USD',
  'FLM-USD',
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'TRX-USD',
  'PAXG-USD',
  'WTI-USD',
  'USDT-USD',
  'USDC-USD',
  'BNB-USD',
  'XRP-USD',
  'DOGE-USD',
] as const;

export const FEED_DISPLAY_META: Record<string, { displaySymbol?: string; unitLabel?: string }> = {
  'FLM-USD': {
    displaySymbol: '1000FLM-USD',
    unitLabel: '1000 FLM',
  },
};

export function getFeedDisplaySymbol(symbol: string) {
  return FEED_DISPLAY_META[String(symbol || '').trim().toUpperCase()]?.displaySymbol
    || String(symbol || '').trim().toUpperCase();
}

export function getFeedUnitLabel(symbol: string) {
  return FEED_DISPLAY_META[String(symbol || '').trim().toUpperCase()]?.unitLabel || '';
}

export function parseFeedSymbols(rawValue?: string | null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...DEFAULT_FEED_SYMBOLS];
  return raw.split(',').map((symbol) => symbol.trim()).filter(Boolean);
}

export function parseFeedProviders(rawValue?: string | null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return ['twelvedata'];
  return raw.split(',').map((provider) => provider.trim().toLowerCase()).filter(Boolean);
}
