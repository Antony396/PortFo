import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getAnalysisFilingsByUserId,
  isDatabaseConfigured,
  upsertAnalysisFilingByUserId,
} from '../../../services/database';

type AnalysisPayload = {
  symbol: string;
  companyName?: string;
  draft?: unknown;
};

function mapFiling(row: {
  symbol: string;
  company_name: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    symbol: row.symbol,
    companyName: row.company_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isAnalysisPayload(value: unknown): value is AnalysisPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as AnalysisPayload;
  return typeof payload.symbol === 'string' && payload.symbol.trim().length > 0;
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ filings: [], storage: 'local-only' }, { status: 200 });
  }

  try {
    const rows = await getAnalysisFilingsByUserId(userId);
    const filings = (rows || []).map(mapFiling);
    return NextResponse.json({ filings, storage: 'database' });
  } catch (error) {
    console.error('Analysis GET error:', error);
    return NextResponse.json({ error: 'Failed to load analysis filings' }, { status: 500 });
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

    if (!isAnalysisPayload(body)) {
      return NextResponse.json({ error: 'Invalid analysis payload' }, { status: 400 });
    }

    const normalizedSymbol = body.symbol.trim().toUpperCase();
    const companyName = typeof body.companyName === 'string' ? body.companyName : normalizedSymbol;

    const saved = await upsertAnalysisFilingByUserId(userId, {
      symbol: normalizedSymbol,
      companyName,
      draft: body.draft,
    });

    if (!saved) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    return NextResponse.json({ filing: mapFiling(saved), storage: 'database' });
  } catch (error) {
    console.error('Analysis PUT error:', error);
    return NextResponse.json({ error: 'Failed to save analysis filing' }, { status: 500 });
  }
}
