import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getPortfolioByUserId,
  isDatabaseConfigured,
  type PortfolioStock,
  upsertPortfolioByUserId,
} from '../../../services/database';

function isValidHolding(value: unknown): value is PortfolioStock {
  if (!value || typeof value !== 'object') return false;
  const holding = value as PortfolioStock;
  return (
    typeof holding.symbol === 'string' &&
    holding.symbol.length > 0 &&
    typeof holding.quantity === 'number' &&
    Number.isFinite(holding.quantity) &&
    typeof holding.avgPrice === 'number' &&
    Number.isFinite(holding.avgPrice)
  );
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ holdings: [], storage: 'local-only' }, { status: 200 });
  }

  try {
    const holdings = await getPortfolioByUserId(userId);
    return NextResponse.json({ holdings: holdings || [], storage: 'database' });
  } catch (error) {
    console.error('Portfolio GET error:', error);
    return NextResponse.json({ error: 'Failed to load portfolio' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const holdings = body?.holdings;

    if (!Array.isArray(holdings) || !holdings.every(isValidHolding)) {
      return NextResponse.json({ error: 'Invalid holdings payload' }, { status: 400 });
    }

    await upsertPortfolioByUserId(userId, holdings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Portfolio PUT error:', error);
    return NextResponse.json({ error: 'Failed to save portfolio' }, { status: 500 });
  }
}
