import { NextResponse } from 'next/server';

type Holding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body?.message || '').trim().toLowerCase();
    const holdings: Holding[] = Array.isArray(body?.holdings) ? body.holdings : [];
    const overview = body?.overview || {};

    const totalValue = Number(overview.totalValue || 0);
    const totalDayChange = Number(overview.totalDayChange || 0);

    const holdingCount = holdings.length;
    const symbols = holdings.map((item) => item.symbol).filter(Boolean);

    let reply =
      'I can help with portfolio summary, day movement, diversification notes, and DCF assumption checks.';

    if (message.includes('summary') || message.includes('overview') || message.includes('portfolio')) {
      reply = `You currently hold ${holdingCount} assets (${symbols.join(', ') || 'none'}) with an estimated total value of $${formatCurrency(totalValue)}. Your day move is ${totalDayChange >= 0 ? '+' : '-'}$${formatCurrency(Math.abs(totalDayChange))}.`;
    } else if (message.includes('risk') || message.includes('divers')) {
      if (holdingCount <= 1) {
        reply = 'Your portfolio is highly concentrated. Consider adding more uncorrelated holdings to reduce single-name risk.';
      } else if (holdingCount <= 3) {
        reply = 'You have moderate concentration. Adding a few more holdings across sectors or geographies can improve diversification.';
      } else {
        reply = 'Your diversification is improving. Next step is balancing position sizes and avoiding overexposure to one sector.';
      }
    } else if (message.includes('day') || message.includes('today') || message.includes('move')) {
      reply = `Today your portfolio is ${totalDayChange >= 0 ? 'up' : 'down'} by ${totalDayChange >= 0 ? '+' : '-'}$${formatCurrency(Math.abs(totalDayChange))}.`;
    } else if (message.includes('dcf') || message.includes('assumption') || message.includes('discount')) {
      reply = 'For DCF, keep discount rate above terminal growth, stress-test 2-3 growth scenarios, and compare intrinsic value with market price rather than using one point estimate.';
    } else if (message.includes('buy') || message.includes('add')) {
      reply = 'Use Edit Portfolio → Add or Merge Lot. Enter ticker, quantity, and buy price; your average cost is recalculated automatically when adding to an existing holding.';
    }

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: 'Unable to process that request right now.' }, { status: 200 });
  }
}
