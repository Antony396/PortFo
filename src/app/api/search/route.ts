import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ result: [] });
  }

  try {
    // Replace YOUR_FINNHUB_API_KEY with your actual key
    // Or better: use process.env.FINNHUB_API_KEY
    const apiKey = process.env.FINNHUB_API_KEY; 
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${query}&token=${apiKey}`
    );
    
    const data = await response.json();

    const normalizedQuery = query.toUpperCase();
    const isAsxItem = (item: any) => {
      const symbol = String(item.symbol || '').toUpperCase();
      const displaySymbol = String(item.displaySymbol || '').toUpperCase();
      const description = String(item.description || '').toUpperCase();

      return (
        symbol.endsWith('.AX') ||
        symbol.startsWith('ASX:') ||
        displaySymbol.endsWith('.AX') ||
        displaySymbol.startsWith('ASX:') ||
        description.includes('ASX')
      );
    };

    const isAllowedType = (type: string) =>
      [
        'Common Stock',
        'ETF',
        'ETP',
        'Mutual Fund',
        'Fund',
        'Crypto',
      ].includes(type);

    const rankedResults = (data.result || [])
      .filter((item: any) => {
        const symbol = String(item.symbol || '').toUpperCase();
        const type = String(item.type || '');
        return isAllowedType(type) || isAsxItem(item) || symbol.includes('.AX');
      })
      .sort((a: any, b: any) => {
        const symbolA = String(a.symbol || '').toUpperCase();
        const symbolB = String(b.symbol || '').toUpperCase();
        const asxA = isAsxItem(a) ? 1 : 0;
        const asxB = isAsxItem(b) ? 1 : 0;

        const aExact = symbolA === normalizedQuery ? 1 : 0;
        const bExact = symbolB === normalizedQuery ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        if (asxA !== asxB) return asxB - asxA;

        const aStarts = symbolA.startsWith(normalizedQuery) ? 1 : 0;
        const bStarts = symbolB.startsWith(normalizedQuery) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;

        return symbolA.localeCompare(symbolB);
      })
      .slice(0, 10);

    return NextResponse.json({ result: rankedResults });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}