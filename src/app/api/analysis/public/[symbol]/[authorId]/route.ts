import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getPublicAnalysisReviewByUserIdAndSymbol,
  getPublicAnalysisReviewVotesByReview,
  isDatabaseConfigured,
} from '../../../../../../services/database';

type VoteSummary = {
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: -1 | 0 | 1;
};

function normalizeSymbol(raw: string) {
  return decodeURIComponent(raw || '').trim().toUpperCase();
}

function normalizeAuthorId(raw: string) {
  return decodeURIComponent(raw || '').trim();
}

function summarizeVotes(
  votes: Array<{ voter_user_id: string; vote: number }>,
  viewerUserId: string | null,
): VoteSummary {
  const summary: VoteSummary = {
    upvotes: 0,
    downvotes: 0,
    score: 0,
    userVote: 0,
  };

  votes.forEach((row) => {
    const vote = row.vote === -1 ? -1 : 1;
    if (vote === 1) {
      summary.upvotes += 1;
      summary.score += 1;
    } else {
      summary.downvotes += 1;
      summary.score -= 1;
    }

    if (viewerUserId && row.voter_user_id === viewerUserId) {
      summary.userVote = vote;
    }
  });

  return summary;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string; authorId: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { userId } = await auth();
  const { symbol: rawSymbol, authorId: rawAuthorId } = await context.params;

  const symbol = normalizeSymbol(rawSymbol);
  const authorId = normalizeAuthorId(rawAuthorId);

  if (!symbol || !authorId) {
    return NextResponse.json({ error: 'Invalid review path' }, { status: 400 });
  }

  try {
    const [row, votes] = await Promise.all([
      getPublicAnalysisReviewByUserIdAndSymbol(authorId, symbol),
      getPublicAnalysisReviewVotesByReview(authorId, symbol),
    ]);

    if (!row) {
      return NextResponse.json({ error: 'Public review not found' }, { status: 404 });
    }

    const voteSummary = summarizeVotes(votes || [], userId || null);

    return NextResponse.json({
      review: {
        reviewUserId: row.review_user_id,
        symbol: row.symbol,
        companyName: row.company_name,
        authorLabel: row.author_label || 'Publisher',
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        publishedFile: row.published_file,
        votes: voteSummary,
      },
      storage: 'database',
    });
  } catch (error) {
    console.error('Public analysis review GET error:', error);
    return NextResponse.json({ error: 'Failed to load public analysis review' }, { status: 500 });
  }
}
