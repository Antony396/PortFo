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

  try {
    // 3. Fetch Price Data
    const priceRes = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${upperSymbol}&token=${apiKey}`
    );
    const priceData = await priceRes.json();

    // 4. Fetch Company Profile
    const profileRes = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${upperSymbol}&token=${apiKey}`
    );
    const profileData = await profileRes.json();

    return NextResponse.json({
      currentPrice: priceData.c || 0,
      percentChange: priceData.dp || 0,
      companyName: profileData.name || 'Unknown Corp',
      logo: profileData.logo || null,
    });
  } catch (error) {
    console.error("FinnHub API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}