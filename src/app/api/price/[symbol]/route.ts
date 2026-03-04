import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  // 1. Change the type to Promise
  { params }: { params: Promise<{ symbol: string }> }
) {
  // 2. Await the params to get the actual values
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Finnhub API key missing' }, { status: 500 });
  }

  try {
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${upperSymbol}&token=${apiKey}`;
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${upperSymbol}&token=${apiKey}`;

    const [priceRes, profileRes] = await Promise.all([
      fetch(quoteUrl, { next: { revalidate: 20 } }),
      fetch(profileUrl, { next: { revalidate: 60 * 60 * 12 } }),
    ]);

    if (!priceRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch quote for ${upperSymbol}` },
        { status: priceRes.status === 429 ? 429 : 502 }
      );
    }

    const priceData = await priceRes.json();
    const rawCurrentPrice = typeof priceData?.c === 'number' && Number.isFinite(priceData.c) ? priceData.c : null;
    const rawPercentChange = typeof priceData?.dp === 'number' && Number.isFinite(priceData.dp) ? priceData.dp : null;

    if (rawCurrentPrice === null || rawPercentChange === null) {
      return NextResponse.json({ error: `Invalid quote payload for ${upperSymbol}` }, { status: 502 });
    }

    let companyName = 'Unknown Corp';
    let logo: string | null = null;

    if (profileRes.ok) {
      const profileData = await profileRes.json();
      if (typeof profileData?.name === 'string' && profileData.name.trim()) {
        companyName = profileData.name.trim();
      }
      if (typeof profileData?.logo === 'string' && profileData.logo.trim()) {
        logo = profileData.logo.trim();
      }
    }

    return NextResponse.json(
      {
        currentPrice: rawCurrentPrice,
        percentChange: rawPercentChange,
        companyName,
        logo,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error("FinnHub API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}