// src/services/finnhub.ts

/// <reference types="next" />
const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

export interface StockQuote {
  currentPrice: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  previousClose: number;
  logo: string;        // Added for company logo
  companyName: string; // Added for display name
}

export async function getStockPrice(symbol: string): Promise<StockQuote> {
  if (!API_KEY) {
    throw new Error("Finnhub API Key is missing from .env.local");
  }

  // We fetch BOTH the price and the profile at the same time
  const [quoteRes, profileRes] = await Promise.all([
    fetch(`${BASE_URL}/quote?symbol=${symbol.toUpperCase()}&token=${API_KEY}`, { next: { revalidate: 60 } }),
    fetch(`${BASE_URL}/stock/profile2?symbol=${symbol.toUpperCase()}&token=${API_KEY}`, { next: { revalidate: 3600 } }) // Logos change rarely, so we cache longer
  ]);

    if (!quoteRes.ok || !profileRes.ok) {
        throw new Error(`Failed to fetch data for ${symbol}`);
    }

  const quoteData = await quoteRes.json();
  const profileData = await profileRes.json();

  return {
    currentPrice: quoteData.c,
    change: quoteData.d,
    percentChange: quoteData.dp,
    high: quoteData.h,
    low: quoteData.l,
    previousClose: quoteData.pc,
    logo: profileData.logo,        // The URL for the logo
    companyName: profileData.name, // e.g. "Apple Inc"
  };
}