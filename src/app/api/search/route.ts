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

    // Finnhub returns an object with a 'result' array
    // We filter it to only show Stocks and Crypto to keep it clean
    const filteredResults = data.result
      .filter((item: any) => item.type === 'Common Stock' || item.type === 'Crypto')
      .slice(0, 8); // Only show top 8 results

    return NextResponse.json({ result: filteredResults });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}