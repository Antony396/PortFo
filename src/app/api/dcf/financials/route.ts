import { NextResponse } from 'next/server';

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'none' || cleaned.toLowerCase() === 'null') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchYahooFinancials(symbol: string) {
  const candidates = Array.from(
    new Set([
      symbol,
      symbol.replace('.', '-'),
      symbol.replace('-', '.'),
    ]),
  );

  let result: any = null;

  for (const candidate of candidates) {
    const yahooUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(candidate)}?modules=financialData,defaultKeyStatistics,cashflowStatementHistory,balanceSheetHistory`;
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      continue;
    }

    const data = await response.json();
    const yahooErrorCode = data?.finance?.error?.code;
    if (yahooErrorCode) {
      continue;
    }
    const maybeResult = data?.quoteSummary?.result?.[0];
    if (maybeResult) {
      result = maybeResult;
      break;
    }
  }

  if (!result) {
    return null;
  }

  const annualCashFlow = result?.cashflowStatementHistory?.cashflowStatements?.[0];
  const annualBalance = result?.balanceSheetHistory?.balanceSheetStatements?.[0];

  const operatingCashFlow = parseNumber(
    annualCashFlow?.totalCashFromOperatingActivities?.raw ??
      annualCashFlow?.operatingCashFlow?.raw,
  );
  const capitalExpenditures = Math.abs(
    parseNumber(annualCashFlow?.capitalExpenditures?.raw),
  );

  const fcfFromStatements =
    operatingCashFlow !== 0 ? operatingCashFlow - capitalExpenditures : 0;

  const fcf =
    parseNumber(result?.financialData?.freeCashflow?.raw ?? result?.financialData?.freeCashFlow?.raw) ||
    fcfFromStatements;
  const shares = parseNumber(result?.defaultKeyStatistics?.sharesOutstanding?.raw);
  const cash =
    parseNumber(result?.financialData?.totalCash?.raw) ||
    parseNumber(annualBalance?.cash?.raw) ||
    parseNumber(annualBalance?.cashAndCashEquivalents?.raw);
  const debt =
    parseNumber(result?.financialData?.totalDebt?.raw) ||
    parseNumber(annualBalance?.shortLongTermDebt?.raw) ||
    (parseNumber(annualBalance?.shortTermDebt?.raw) + parseNumber(annualBalance?.longTermDebt?.raw));

  if (fcf === 0 && shares === 0 && cash === 0 && debt === 0) {
    return null;
  }

  return { fcf, shares, cash, debt };
}

async function fetchAlphaFinancials(symbol: string, apiKey: string) {
  const cashFlowUrl = `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${symbol}&apikey=${apiKey}`;
  const balanceSheetUrl = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${symbol}&apikey=${apiKey}`;
  const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;

  const [cashFlowRes, balanceSheetRes, overviewRes] = await Promise.all([
    fetch(cashFlowUrl, { next: { revalidate: 300 } }),
    fetch(balanceSheetUrl, { next: { revalidate: 300 } }),
    fetch(overviewUrl, { next: { revalidate: 300 } }),
  ]);

  const cashFlowData = await cashFlowRes.json();
  const balanceSheetData = await balanceSheetRes.json();
  const overviewData = await overviewRes.json();

  if (
    cashFlowData?.Note ||
    balanceSheetData?.Note ||
    overviewData?.Note ||
    cashFlowData?.Information ||
    balanceSheetData?.Information ||
    overviewData?.Information
  ) {
    throw new Error('Alpha Vantage rate limit reached. Please try again in a minute.');
  }

  if (
    cashFlowData?.['Error Message'] ||
    balanceSheetData?.['Error Message'] ||
    overviewData?.['Error Message']
  ) {
    throw new Error('Alpha Vantage could not find this symbol.');
  }

  const latestCashFlowAnnual = cashFlowData?.annualReports?.[0] as Record<string, unknown> | undefined;
  const latestBalanceAnnual = balanceSheetData?.annualReports?.[0] as Record<string, unknown> | undefined;

  if (!latestCashFlowAnnual || !latestBalanceAnnual) {
    return null;
  }

  const operatingCashFlow = parseNumber(latestCashFlowAnnual.operatingCashflow);
  const capitalExpendituresRaw = parseNumber(latestCashFlowAnnual.capitalExpenditures);
  const capitalExpenditures = Math.abs(capitalExpendituresRaw);

  const fcf = operatingCashFlow !== 0 ? operatingCashFlow - capitalExpenditures : 0;

  const shares =
    firstNumeric(latestBalanceAnnual, ['commonStockSharesOutstanding']) ||
    parseNumber(overviewData?.SharesOutstanding);

  const cash = firstNumeric(latestBalanceAnnual, [
    'cashAndCashEquivalentsAtCarryingValue',
    'cashAndShortTermInvestments',
    'cashAndCashEquivalents',
  ]);

  const debt =
    firstNumeric(latestBalanceAnnual, ['shortLongTermDebtTotal', 'totalDebt']) ||
    firstNumeric(latestBalanceAnnual, ['shortTermDebt', 'currentDebt']) +
      firstNumeric(latestBalanceAnnual, ['longTermDebtNoncurrent', 'longTermDebt']);

  return { fcf, shares, cash, debt };
}

function prefer(primary: number, fallback: number): number {
  return primary !== 0 ? primary : fallback;
}

function firstNumeric(report: Record<string, unknown> | undefined, keys: string[]): number {
  if (!report) return 0;
  for (const key of keys) {
    const parsed = parseNumber(report[key]);
    if (parsed !== 0) return parsed;
  }
  return 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.trim().toUpperCase();
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required.' }, { status: 400 });
  }

  try {
    const yahooFinancials = await fetchYahooFinancials(symbol);
    const alphaFinancials = apiKey ? await fetchAlphaFinancials(symbol, apiKey) : null;

    const fcf = prefer(yahooFinancials?.fcf ?? 0, alphaFinancials?.fcf ?? 0);
    const shares = prefer(yahooFinancials?.shares ?? 0, alphaFinancials?.shares ?? 0);
    const cash = prefer(yahooFinancials?.cash ?? 0, alphaFinancials?.cash ?? 0);
    const debt = prefer(yahooFinancials?.debt ?? 0, alphaFinancials?.debt ?? 0);

    if (fcf === 0 && shares === 0 && cash === 0 && debt === 0) {
      return NextResponse.json(
        { error: 'No financial data found for this symbol from Yahoo or Alpha Vantage. (Some tickers, ETFs, ADRs, crypto, and recently listed companies may not expose full statements.)' },
        { status: 404 },
      );
    }

    const source =
      yahooFinancials && alphaFinancials
        ? 'yahoo+alpha-vantage'
        : yahooFinancials
          ? 'yahoo'
          : alphaFinancials
            ? 'alpha-vantage'
            : 'none';

    return NextResponse.json({ symbol, fcf, shares, cash, debt, source });
  } catch (error) {
    console.error('DCF financials autofill error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch financials.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
