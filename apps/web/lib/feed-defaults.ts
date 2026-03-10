export const DEFAULT_FEED_SYMBOLS = [
  'NEO-USD',
  'GAS-USD',
  'FLM-USD',
  'BTC-USD',
  'ETH-USD',
  'TRX-USD',
  'SOL-USD',
  'PAXG-USD',
  'OIL-USD',
  'USDT-USD',
  'USDC-USD',
  'BNB-USD',
  'XRP-USD',
  'DOGE-USD',
] as const;

export function parseFeedSymbols(rawValue?: string | null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...DEFAULT_FEED_SYMBOLS];
  return raw.split(',').map((symbol) => symbol.trim()).filter(Boolean);
}

export function parseFeedProviders(rawValue?: string | null) {
  const raw = String(rawValue || '').trim();
  if (!raw) return ['twelvedata', 'binance-spot'];
  return raw.split(',').map((provider) => provider.trim().toLowerCase()).filter(Boolean);
}
