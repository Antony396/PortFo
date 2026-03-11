import { NextResponse } from 'next/server';
import { getCached, TTL } from '@/lib/cache';

type FundamentalsPayload = {
  currentPe: number | null;
  dividendYield: number | null;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickMetric(metricRecord: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asFiniteNumber(metricRecord[key]);
    if (value !== null) return value;
  }
  return null;
}

function average(values: Array<number | null>): number | null {
  const validValues = values.filter((value): value is number => value !== null);
  if (validValues.length === 0) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function extractReportYear(report: Record<string, unknown>): number | null {
  const yearValue = asFiniteNumber(report.year);
  if (yearValue !== null && Number.isInteger(yearValue)) {
    return yearValue;
  }

  const endDate = typeof report.endDate === 'string' ? report.endDate : '';
  if (!endDate) return null;

  const parsedDate = new Date(endDate);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate.getUTCFullYear();
}

function extractAnnualEps(reportEntry: unknown): { year: number; eps: number } | null {
  if (!reportEntry || typeof reportEntry !== 'object') return null;

  const report = reportEntry as Record<string, unknown>;
  const year = extractReportYear(report);
  if (year === null) return null;

  const reportData = report.report;
  if (!reportData || typeof reportData !== 'object') return null;

  const incomeStatement = (reportData as Record<string, unknown>).ic;
  if (!Array.isArray(incomeStatement)) return null;

  let bestScore = -1;
  let bestValue: number | null = null;

  for (const lineItem of incomeStatement) {
    if (!lineItem || typeof lineItem !== 'object') continue;

    const item = lineItem as Record<string, unknown>;
    const value = asFiniteNumber(item.value);
    if (value === null) continue;

    const concept = String(item.concept ?? item.label ?? '').toLowerCase();
    let score = -1;

    if (concept.includes('earningspersharediluted') || concept.includes('dilutedeps')) {
      score = 4;
    } else if (concept.includes('earningspersharebasic') || concept.includes('basiceps')) {
      score = 3;
    } else if (concept.includes('earningspershare')) {
      score = 2;
    } else if (concept.includes('eps')) {
      score = 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  if (bestScore < 0 || bestValue === null || !(bestValue > 0)) return null;

  return { year, eps: bestValue };
}

function buildAverageCloseByYear(candlesPayload: unknown): Map<number, number> {
  const averages = new Map<number, number>();
  if (!candlesPayload || typeof candlesPayload !== 'object') return averages;

  const payload = candlesPayload as Record<string, unknown>;
  const status = typeof payload.s === 'string' ? payload.s : '';
  if (status !== 'ok') return averages;

  const closes = Array.isArray(payload.c) ? payload.c : [];
  const timestamps = Array.isArray(payload.t) ? payload.t : [];
  const length = Math.min(closes.length, timestamps.length);
  if (length === 0) return averages;

  const buckets = new Map<number, { sum: number; count: number }>();

  for (let index = 0; index < length; index += 1) {
    const close = asFiniteNumber(closes[index]);
    const timestamp = asFiniteNumber(timestamps[index]);
    if (close === null || timestamp === null) continue;

    const year = new Date(timestamp * 1000).getUTCFullYear();
    const bucket = buckets.get(year) ?? { sum: 0, count: 0 };
    bucket.sum += close;
    bucket.count += 1;
    buckets.set(year, bucket);
  }

  buckets.forEach((bucket, year) => {
    if (bucket.count > 0) {
      averages.set(year, bucket.sum / bucket.count);
    }
  });

  return averages;
}

function buildAnnualEpsByYearFromFinancialReports(reports: unknown[]): Map<number, number> {
  const epsByYear = new Map<number, number>();
  if (!Array.isArray(reports) || reports.length === 0) return epsByYear;

  for (const reportEntry of reports) {
    const extracted = extractAnnualEps(reportEntry);
    if (!extracted) continue;

    if (!epsByYear.has(extracted.year)) {
      epsByYear.set(extracted.year, extracted.eps);
    }
  }

  return epsByYear;
}

function buildAnnualEpsByYearFromEarningsHistory(earningsPayload: unknown): Map<number, number> {
  const epsByYear = new Map<number, number>();
  if (!Array.isArray(earningsPayload) || earningsPayload.length === 0) return epsByYear;

  const buckets = new Map<number, { sum: number; count: number }>();

  for (const entry of earningsPayload) {
    if (!entry || typeof entry !== 'object') continue;

    const record = entry as Record<string, unknown>;
    const actualEps = asFiniteNumber(record.actual);
    if (actualEps === null) continue;

    let year: number | null = null;
    const rawYear = asFiniteNumber(record.year);
    if (rawYear !== null && Number.isInteger(rawYear)) {
      year = rawYear;
    }

    if (year === null) {
      const period = typeof record.period === 'string' ? record.period : '';
      if (period) {
        const parsedDate = new Date(period);
        if (!Number.isNaN(parsedDate.getTime())) {
          year = parsedDate.getUTCFullYear();
        }
      }
    }

    if (year === null) continue;

    const bucket = buckets.get(year) ?? { sum: 0, count: 0 };
    bucket.sum += actualEps;
    bucket.count += 1;
    buckets.set(year, bucket);
  }

  buckets.forEach((bucket, year) => {
    if (bucket.count >= 3) {
      epsByYear.set(year, bucket.sum);
    }
  });

  return epsByYear;
}

function computeFiveYearAveragePe(
  epsByYear: Map<number, number>,
  averageCloseByYear: Map<number, number>,
): number | null {
  if (epsByYear.size === 0 || averageCloseByYear.size === 0) return null;

  const years = Array.from(epsByYear.keys()).sort((a, b) => b - a);
  const yearlyPeValues: number[] = [];

  for (const year of years) {
    if (yearlyPeValues.length === 5) break;

    const eps = epsByYear.get(year);
    const averageClose = averageCloseByYear.get(year);
    if (typeof eps !== 'number' || typeof averageClose !== 'number') continue;
    if (!(eps > 0) || !(averageClose > 0)) continue;

    const pe = averageClose / eps;
    if (Number.isFinite(pe) && pe > 0) {
      yearlyPeValues.push(pe);
    }
  }

  if (yearlyPeValues.length < 5) return null;

  return yearlyPeValues.reduce((sum, value) => sum + value, 0) / yearlyPeValues.length;
}

function resolveDividendYieldPercent(metricRecord: Record<string, unknown>, currentPrice: number): number | null {
  const rawMetricYield = pickMetric(metricRecord, [
    'dividendYieldIndicatedAnnual',
    'dividendYieldAnnual',
    'currentDividendYieldTTM',
    'dividendYieldTTM',
    'dividendYield5Y',
  ]);

  const annualDividendPerShare = pickMetric(metricRecord, [
    'annualDividend',
    'dividendPerShareAnnual',
    'dividendPerShareTTM',
    'dividendPerShare',
  ]);

  const derivedYield =
    annualDividendPerShare !== null && currentPrice > 0
      ? (annualDividendPerShare / currentPrice) * 100
      : null;

  if (rawMetricYield !== null && derivedYield !== null) {
    const rawDiff = Math.abs(rawMetricYield - derivedYield);
    const scaledRaw = rawMetricYield * 100;
    const scaledDiff = Math.abs(scaledRaw - derivedYield);
    const tolerance = Math.max(0.05, Math.abs(derivedYield) * 0.25);

    if (rawDiff <= tolerance || scaledDiff <= tolerance) {
      return scaledDiff < rawDiff ? scaledRaw : rawMetricYield;
    }

    return derivedYield;
  }

  if (rawMetricYield !== null) {
    if (rawMetricYield > 0 && rawMetricYield < 0.05) {
      return rawMetricYield * 100;
    }
    return rawMetricYield;
  }

  return derivedYield;
}

export async function GET(
  request: Request,
  // 1. Change the type to Promise
  { params }: { params: Promise<{ symbol: string }> }
) {
  // 2. Await the params to get the actual values
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const apiKey = process.env.FINNHUB_API_KEY;
  const includeFundamentals = new URL(request.url).searchParams.get('includeFundamentals') === '1';

  if (!apiKey) {
    return NextResponse.json({ error: 'Finnhub API key missing' }, { status: 500 });
  }

  try {
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${upperSymbol}&token=${apiKey}`;
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${upperSymbol}&token=${apiKey}`;

    // Fetch price and profile concurrently, each with their own server-side cache.
    const [priceData, profileData] = await Promise.all([
      getCached(`price:${upperSymbol}`, TTL.PRICE, async () => {
        const res = await fetch(quoteUrl);
        if (!res.ok) throw Object.assign(new Error(`quote:${res.status}`), { status: res.status });
        return res.json() as Promise<Record<string, unknown>>;
      }),
      getCached(`profile:${upperSymbol}`, TTL.PROFILE, async () => {
        const res = await fetch(profileUrl);
        if (!res.ok) return {} as Record<string, unknown>;
        return res.json() as Promise<Record<string, unknown>>;
      }),
    ]);

    const rawCurrentPrice = typeof priceData?.c === 'number' && Number.isFinite(priceData.c) ? priceData.c : null;
    const rawPercentChange = typeof priceData?.dp === 'number' && Number.isFinite(priceData.dp) ? priceData.dp : null;

    if (rawCurrentPrice === null || rawPercentChange === null) {
      return NextResponse.json({ error: `Invalid quote payload for ${upperSymbol}` }, { status: 502 });
    }

    let companyName = 'Unknown Corp';
    let logo: string | null = null;

    if (typeof profileData?.name === 'string' && profileData.name.trim()) {
      companyName = profileData.name.trim();
    }
    if (typeof profileData?.logo === 'string' && profileData.logo.trim()) {
      logo = profileData.logo.trim();
    }

    let fundamentals: FundamentalsPayload | null = null;
    if (includeFundamentals) {
      try {
        const metricRecord = await getCached(`metrics:${upperSymbol}`, TTL.METRICS, async () => {
          const metricsRes = await fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${upperSymbol}&metric=all&token=${apiKey}`,
          );
          if (!metricsRes.ok) return {} as Record<string, unknown>;
          const metricsData = await metricsRes.json();
          return (metricsData?.metric && typeof metricsData.metric === 'object'
            ? metricsData.metric
            : {}) as Record<string, unknown>;
        });

        const trailingPe = pickMetric(metricRecord, ['peBasicExclExtraTTM', 'peInclExtraTTM', 'peTTM']);
        const normalizedPe = pickMetric(metricRecord, ['peNormalizedAnnual', 'peBasicExclExtraAnnual', 'peExclExtraAnnual', 'peAnnual']);

        fundamentals = {
          currentPe: trailingPe ?? normalizedPe,
          dividendYield: resolveDividendYieldPercent(metricRecord, rawCurrentPrice),
        };
      } catch (metricsError) {
        console.error(`FinnHub metrics fetch failed for ${upperSymbol}`, metricsError);
      }
    }

    return NextResponse.json(
      {
        currentPrice: rawCurrentPrice,
        percentChange: rawPercentChange,
        companyName,
        logo,
        ...(fundamentals ? { fundamentals } : {}),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error("FinnHub API Error:", error);
    const status = (error as { status?: number }).status;
    if (status === 429) return NextResponse.json({ error: `Rate limited for ${upperSymbol}` }, { status: 429 });
    if (status) return NextResponse.json({ error: `Failed to fetch quote for ${upperSymbol}` }, { status: 502 });
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}