import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  deleteAnalysisFilingByUserIdAndSymbol,
  deletePublicAnalysisReviewByUserIdAndSymbol,
  getAnalysisFilingByUserIdAndSymbol,
  isDatabaseConfigured,
  upsertPublicAnalysisReviewByUserId,
  upsertAnalysisFilingByUserId,
} from '../../../../services/database';

type AnalysisPayload = {
  companyName?: string;
  draft?: unknown;
};

function normalizeSymbol(raw: string) {
  return decodeURIComponent(raw || '').trim().toUpperCase();
}

function mapFiling(row: {
  symbol: string;
  company_name: string;
  created_at: string;
  updated_at: string;
  draft?: unknown;
}) {
  return {
    symbol: row.symbol,
    companyName: row.company_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    draft: row.draft,
  };
}

function isAnalysisPayload(value: unknown): value is AnalysisPayload {
  return Boolean(value) && typeof value === 'object';
}

function resolvePublishedFile(draft: unknown): unknown | null {
  if (!draft || typeof draft !== 'object') return null;

  const publishedCandidate = (draft as { publishedFile?: unknown }).publishedFile;
  return publishedCandidate && typeof publishedCandidate === 'object' ? publishedCandidate : null;
}

function resolvePublishedAt(publishedFile: unknown): string {
  if (!publishedFile || typeof publishedFile !== 'object') return '';

  const candidate = (publishedFile as { publishedAt?: unknown }).publishedAt;
  return typeof candidate === 'string' ? candidate : '';
}

function resolvePublicReviewOptIn(draft: unknown, publishedFile: unknown | null): boolean {
  if (!draft || typeof draft !== 'object') {
    return Boolean(publishedFile);
  }

  const candidate = (draft as { publicReviewOptIn?: unknown }).publicReviewOptIn;
  if (typeof candidate === 'boolean') {
    return candidate;
  }

  return Boolean(publishedFile);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ filing: null, storage: 'local-only' }, { status: 200 });
  }

  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeSymbol(rawSymbol);

  if (!symbol) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    const row = await getAnalysisFilingByUserIdAndSymbol(userId, symbol);

    if (!row) {
      return NextResponse.json({ filing: null, storage: 'database' }, { status: 200 });
    }

    return NextResponse.json({ filing: mapFiling(row), storage: 'database' });
  } catch (error) {
    console.error('Analysis symbol GET error:', error);
    return NextResponse.json({ error: 'Failed to load analysis filing' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeSymbol(rawSymbol);

  if (!symbol) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    const body = await request.json();

    if (!isAnalysisPayload(body)) {
      return NextResponse.json({ error: 'Invalid analysis payload' }, { status: 400 });
    }

    const companyName = typeof body.companyName === 'string' && body.companyName.trim()
      ? body.companyName.trim()
      : symbol;

    const saved = await upsertAnalysisFilingByUserId(userId, {
      symbol,
      companyName,
      draft: body.draft,
    });

    if (!saved) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const publishedFile = resolvePublishedFile(body.draft);
    const publicReviewOptIn = resolvePublicReviewOptIn(body.draft, publishedFile);

    if (publishedFile && publicReviewOptIn) {
      try {
        await upsertPublicAnalysisReviewByUserId(userId, {
          symbol,
          companyName,
          authorLabel: `User ${userId.slice(0, 8)}`,
          publishedFile,
          publishedAt: resolvePublishedAt(publishedFile),
        });
      } catch (publicReviewError) {
        console.error('Public analysis sync failed:', publicReviewError);
      }
    } else {
      try {
        await deletePublicAnalysisReviewByUserIdAndSymbol(userId, symbol);
      } catch (publicReviewDeleteError) {
        console.error('Public analysis unpublish failed:', publicReviewDeleteError);
      }
    }

    return NextResponse.json({ filing: mapFiling(saved), storage: 'database' });
  } catch (error) {
    console.error('Analysis symbol PUT error:', error);
    return NextResponse.json({ error: 'Failed to save analysis filing' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeSymbol(rawSymbol);

  if (!symbol) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    await deleteAnalysisFilingByUserIdAndSymbol(userId, symbol);

    try {
      await deletePublicAnalysisReviewByUserIdAndSymbol(userId, symbol);
    } catch (publicDeleteError) {
      console.error('Public analysis review delete sync failed:', publicDeleteError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Analysis symbol DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete analysis filing' }, { status: 500 });
  }
}
