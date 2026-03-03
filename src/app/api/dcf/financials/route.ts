import { NextResponse } from 'next/server';

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'none' || cleaned.toLowerCase() === 'null') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required.' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'ALPHA_VANTAGE_API_KEY is missing in environment variables.' }, { status: 500 });
  }

  try {
    const cashFlowUrl = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${symbol}&apikey=${apiKey}`;
    const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;

    const [cashFlowRes, overviewRes] = await Promise.all([
      fetch(cashFlowUrl, { next: { revalidate: 300 } }),
      fetch(overviewUrl, { next: { revalidate: 300 } }),
    ]);

    const cashFlowData = await cashFlowRes.json();
    const overviewData = await overviewRes.json();

    if (cashFlowData?.Note || overviewData?.Note) {
      return NextResponse.json({ error: 'Alpha Vantage rate limit reached. Please try again in a minute.' }, { status: 429 });
    }

    const latestAnnual = cashFlowData?.annualReports?.[0];
    if (!latestAnnual) {
      return NextResponse.json({ error: 'No cash flow data found for this symbol.' }, { status: 404 });
    }

    const operatingCashFlow = parseNumber(latestAnnual.operatingCashflow);
    const capitalExpenditures = parseNumber(latestAnnual.capitalExpenditures);
    const changeInAssets = parseNumber(latestAnnual.changeInOperatingAssets);
    const changeInLiabilities = parseNumber(latestAnnual.changeInOperatingLiabilities);

    const fcf =
      operatingCashFlow !== 0
        ? operatingCashFlow - capitalExpenditures - changeInAssets + changeInLiabilities
        : 0;

    const shares = parseNumber(overviewData?.SharesOutstanding);
    const cash = parseNumber(overviewData?.Cash);
    const debt = parseNumber(overviewData?.Debt);

    return NextResponse.json({
      symbol,
      fcf,
      shares,
      cash,
      debt,
    });
  } catch (error) {
    console.error('DCF financials autofill error:', error);
    return NextResponse.json({ error: 'Failed to fetch financials.' }, { status: 500 });
  }
}
