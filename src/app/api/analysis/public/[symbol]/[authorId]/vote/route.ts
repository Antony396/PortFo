import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  deletePublicAnalysisReviewVote,
  getPublicAnalysisReviewByUserIdAndSymbol,
  getPublicAnalysisReviewVotesByReview,
  isDatabaseConfigured,
  upsertPublicAnalysisReviewVote,
} from '../../../../../../../services/database';

type VotePayload = {
  vote: -1 | 0 | 1;
};

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

function isVotePayload(value: unknown): value is VotePayload {
  if (!value || typeof value !== 'object') return false;

  const vote = (value as VotePayload).vote;
  return vote === -1 || vote === 0 || vote === 1;
}

function summarizeVotes(
  votes: Array<{ voter_user_id: string; vote: number }>,
  viewerUserId: string,
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

    if (row.voter_user_id === viewerUserId) {
      summary.userVote = vote;
    }
  });

  return summary;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ symbol: string; authorId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { symbol: rawSymbol, authorId: rawAuthorId } = await context.params;
  const symbol = normalizeSymbol(rawSymbol);
  const authorId = normalizeAuthorId(rawAuthorId);

  if (!symbol || !authorId) {
    return NextResponse.json({ error: 'Invalid review path' }, { status: 400 });
  }

  if (authorId === userId) {
    return NextResponse.json({ error: 'You cannot vote on your own review' }, { status: 400 });
  }

  try {
    const body = await request.json();
    if (!isVotePayload(body)) {
      return NextResponse.json({ error: 'Invalid vote payload' }, { status: 400 });
    }

    const review = await getPublicAnalysisReviewByUserIdAndSymbol(authorId, symbol);
    if (!review) {
      return NextResponse.json({ error: 'Public review not found' }, { status: 404 });
    }

    if (body.vote === 0) {
      await deletePublicAnalysisReviewVote({
        reviewUserId: authorId,
        symbol,
        voterUserId: userId,
      });
    } else {
      await upsertPublicAnalysisReviewVote({
        reviewUserId: authorId,
        symbol,
        voterUserId: userId,
        vote: body.vote,
      });
    }

    const votes = await getPublicAnalysisReviewVotesByReview(authorId, symbol);
    const voteSummary = summarizeVotes(votes || [], userId);

    return NextResponse.json({ ok: true, votes: voteSummary });
  } catch (error) {
    console.error('Public analysis vote PUT error:', error);
    return NextResponse.json({ error: 'Failed to save vote' }, { status: 500 });
  }
}
