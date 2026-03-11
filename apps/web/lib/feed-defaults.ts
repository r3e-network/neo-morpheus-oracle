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

export type FeedDescriptor = {
  pair: string;
  category: "Crypto" | "Commodity" | "Equity" | "ETF" | "FX";
  meaning: string;
  sourceSymbol: string;
  unit: string;
  note?: string;
};

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

export const FEED_DESCRIPTORS: Record<string, FeedDescriptor> = {
  "NEO-USD": { pair: "NEO-USD", category: "Crypto", meaning: "Price of 1 NEO in USD", sourceSymbol: "NEO/USD", unit: "1 NEO" },
  "GAS-USD": { pair: "GAS-USD", category: "Crypto", meaning: "Price of 1 GAS in USD", sourceSymbol: "GAS/USD", unit: "1 GAS" },
  "1000FLM-USD": { pair: "1000FLM-USD", category: "Crypto", meaning: "Price of 1000 FLM in USD", sourceSymbol: "FLM/USD", unit: "1000 FLM", note: "Scaled by 1000 because 1 FLM is too small to preserve well as integer cents." },
  "BTC-USD": { pair: "BTC-USD", category: "Crypto", meaning: "Price of 1 BTC in USD", sourceSymbol: "BTC/USD", unit: "1 BTC" },
  "ETH-USD": { pair: "ETH-USD", category: "Crypto", meaning: "Price of 1 ETH in USD", sourceSymbol: "ETH/USD", unit: "1 ETH" },
  "SOL-USD": { pair: "SOL-USD", category: "Crypto", meaning: "Price of 1 SOL in USD", sourceSymbol: "SOL/USD", unit: "1 SOL" },
  "TRX-USD": { pair: "TRX-USD", category: "Crypto", meaning: "Price of 1 TRX in USD", sourceSymbol: "TRX/USD", unit: "1 TRX" },
  "PAXG-USD": { pair: "PAXG-USD", category: "Crypto", meaning: "Price of 1 PAXG token in USD", sourceSymbol: "PAXG/USD", unit: "1 PAXG" },
  "WTI-USD": { pair: "WTI-USD", category: "Commodity", meaning: "WTI crude oil reference price in USD", sourceSymbol: "WTI/USD", unit: "WTI reference unit" },
  "BRENT-USD": { pair: "BRENT-USD", category: "Commodity", meaning: "Brent crude spot reference price in USD", sourceSymbol: "XBR/USD", unit: "Brent spot reference unit" },
  "NATGAS-USD": { pair: "NATGAS-USD", category: "Commodity", meaning: "Natural gas reference price in USD", sourceSymbol: "NG/USD", unit: "Natural gas reference unit" },
  "COPPER-USD": { pair: "COPPER-USD", category: "Commodity", meaning: "Copper front-month futures proxy in USD", sourceSymbol: "HG1", unit: "1 copper futures reference unit", note: "Uses TwelveData copper futures symbol HG1." },
  "WHEAT-USD": { pair: "WHEAT-USD", category: "Commodity", meaning: "Wheat front-month futures proxy in USD", sourceSymbol: "W_1", unit: "1 wheat futures reference unit", note: "Uses TwelveData agricultural futures symbol W_1." },
  "CORN-USD": { pair: "CORN-USD", category: "Commodity", meaning: "Corn front-month futures proxy in USD", sourceSymbol: "C_1", unit: "1 corn futures reference unit", note: "Uses TwelveData agricultural futures symbol C_1." },
  "SOY-USD": { pair: "SOY-USD", category: "Commodity", meaning: "Soybean front-month futures proxy in USD", sourceSymbol: "S_1", unit: "1 soybean futures reference unit", note: "Uses TwelveData agricultural futures symbol S_1." },
  "USDT-USD": { pair: "USDT-USD", category: "Crypto", meaning: "Price of 1 USDT in USD", sourceSymbol: "USDT/USD", unit: "1 USDT" },
  "USDC-USD": { pair: "USDC-USD", category: "Crypto", meaning: "Price of 1 USDC in USD", sourceSymbol: "USDC/USD", unit: "1 USDC" },
  "BNB-USD": { pair: "BNB-USD", category: "Crypto", meaning: "Price of 1 BNB in USD", sourceSymbol: "BNB/USD", unit: "1 BNB" },
  "XRP-USD": { pair: "XRP-USD", category: "Crypto", meaning: "Price of 1 XRP in USD", sourceSymbol: "XRP/USD", unit: "1 XRP" },
  "DOGE-USD": { pair: "DOGE-USD", category: "Crypto", meaning: "Price of 1 DOGE in USD", sourceSymbol: "DOGE/USD", unit: "1 DOGE" },
  "AAPL-USD": { pair: "AAPL-USD", category: "Equity", meaning: "Price of 1 AAPL share in USD", sourceSymbol: "AAPL", unit: "1 share" },
  "GOOGL-USD": { pair: "GOOGL-USD", category: "Equity", meaning: "Price of 1 GOOGL share in USD", sourceSymbol: "GOOGL", unit: "1 share" },
  "MSFT-USD": { pair: "MSFT-USD", category: "Equity", meaning: "Price of 1 MSFT share in USD", sourceSymbol: "MSFT", unit: "1 share" },
  "AMZN-USD": { pair: "AMZN-USD", category: "Equity", meaning: "Price of 1 AMZN share in USD", sourceSymbol: "AMZN", unit: "1 share" },
  "TSLA-USD": { pair: "TSLA-USD", category: "Equity", meaning: "Price of 1 TSLA share in USD", sourceSymbol: "TSLA", unit: "1 share" },
  "META-USD": { pair: "META-USD", category: "Equity", meaning: "Price of 1 META share in USD", sourceSymbol: "META", unit: "1 share" },
  "NVDA-USD": { pair: "NVDA-USD", category: "Equity", meaning: "Price of 1 NVDA share in USD", sourceSymbol: "NVDA", unit: "1 share" },
  "SPY-USD": { pair: "SPY-USD", category: "ETF", meaning: "Price of 1 SPY share in USD", sourceSymbol: "SPY", unit: "1 ETF share" },
  "QQQ-USD": { pair: "QQQ-USD", category: "ETF", meaning: "Price of 1 QQQ share in USD", sourceSymbol: "QQQ", unit: "1 ETF share" },
  "GLD-USD": { pair: "GLD-USD", category: "ETF", meaning: "Price of 1 GLD share in USD", sourceSymbol: "GLD", unit: "1 ETF share" },
  "EUR-USD": { pair: "EUR-USD", category: "FX", meaning: "Price of 1 EUR in USD", sourceSymbol: "EUR/USD", unit: "1 EUR" },
  "GBP-USD": { pair: "GBP-USD", category: "FX", meaning: "Price of 1 GBP in USD", sourceSymbol: "GBP/USD", unit: "1 GBP" },
  "1000JPY-USD": { pair: "1000JPY-USD", category: "FX", meaning: "Price of 1000 JPY in USD", sourceSymbol: "USD/JPY", unit: "1000 JPY", note: "Fetched as USD/JPY, then inverted and scaled by 1000." },
  "CNY-USD": { pair: "CNY-USD", category: "FX", meaning: "Price of 1 CNY in USD", sourceSymbol: "USD/CNY", unit: "1 CNY", note: "Fetched as USD/CNY, then inverted." },
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

export function getFeedDescriptor(symbol: string) {
  return FEED_DESCRIPTORS[normalizeFeedSymbol(symbol)] || null;
}

export function getAllFeedDescriptors() {
  return DEFAULT_FEED_SYMBOLS.map((symbol) => FEED_DESCRIPTORS[symbol]).filter(Boolean);
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
