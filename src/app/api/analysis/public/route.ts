import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getPublicAnalysisReviewsBySymbol,
  getPublicAnalysisReviewVotesBySymbol,
  isDatabaseConfigured,
} from '../../../../services/database';

type VoteSummary = {
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: -1 | 0 | 1;
};

function normalizeSymbol(raw: string | null) {
  return decodeURIComponent(raw || '').trim().toUpperCase();
}

function reviewVoteKey(reviewUserId: string, symbol: string) {
  return `${reviewUserId}::${symbol}`;
}

function buildVoteSummaryByReview(
  votes: Array<{ review_user_id: string; symbol: string; voter_user_id: string; vote: number }>,
  viewerUserId: string | null,
) {
  const summary = new Map<string, VoteSummary>();

  votes.forEach((voteRow) => {
    const key = reviewVoteKey(voteRow.review_user_id, voteRow.symbol);
    const existing = summary.get(key) || {
      upvotes: 0,
      downvotes: 0,
      score: 0,
      userVote: 0 as -1 | 0 | 1,
    };

    const vote = voteRow.vote === -1 ? -1 : 1;
    if (vote === 1) {
      existing.upvotes += 1;
      existing.score += 1;
    } else {
      existing.downvotes += 1;
      existing.score -= 1;
    }

    if (viewerUserId && voteRow.voter_user_id === viewerUserId) {
      existing.userVote = vote;
    }

    summary.set(key, existing);
  });

  return summary;
}

function summaryPreviewFromPublishedFile(publishedFile: unknown): string {
  if (!publishedFile || typeof publishedFile !== 'object') return '';

  const candidate = (publishedFile as { casesSummary?: unknown }).casesSummary;
  if (typeof candidate !== 'string') return '';

  return candidate.trim().slice(0, 220);
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ reviews: [], storage: 'local-only' }, { status: 200 });
  }

  const { userId } = await auth();
  const { searchParams } = new URL(request.url);
  const symbol = normalizeSymbol(searchParams.get('symbol'));

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const rows = await getPublicAnalysisReviewsBySymbol(symbol, 30);

    let votes: Array<{ review_user_id: string; symbol: string; voter_user_id: string; vote: number }> = [];
    try {
      votes = (await getPublicAnalysisReviewVotesBySymbol(symbol)) || [];
    } catch (voteLoadError) {
      console.error('Public analysis votes GET warning:', voteLoadError);
    }

    const voteSummaryByReview = buildVoteSummaryByReview(votes || [], userId || null);
    const reviews = (rows || []).map((row) => {
      const key = reviewVoteKey(row.review_user_id, row.symbol);
      const votesSummary = voteSummaryByReview.get(key) || {
        upvotes: 0,
        downvotes: 0,
        score: 0,
        userVote: 0,
      };

      return {
        reviewUserId: row.review_user_id,
        symbol: row.symbol,
        companyName: row.company_name,
        authorLabel: row.author_label || 'Publisher',
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        summaryPreview: summaryPreviewFromPublishedFile(row.published_file),
        votes: votesSummary,
      };
    });

    return NextResponse.json({ reviews, storage: 'database' });
  } catch (error) {
    console.error('Public analysis reviews GET error:', error);
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to load public analysis reviews: ${details}` }, { status: 500 });
  }
}
