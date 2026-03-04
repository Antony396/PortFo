'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

type ScenarioKey = 'conservative' | 'base' | 'aggressive';

type ScenarioAnalysis = {
  growthRate: string;
  analysis: string;
  likelihood: string;
};

type PublishedAnalysisFile = {
  symbol: string;
  companyName: string;
  publishedAt: string;
  scenarioAnalyses: Record<ScenarioKey, ScenarioAnalysis>;
  casesSummary: string;
  activeScenario: ScenarioKey;
  savedDcfPrice: number | null;
  savedDcfAt: string;
};

type VoteSummary = {
  upvotes: number;
  downvotes: number;
  score: number;
  userVote: -1 | 0 | 1;
};

type PublicReview = {
  reviewUserId: string;
  symbol: string;
  companyName: string;
  authorLabel: string;
  publishedAt: string;
  updatedAt: string;
  publishedFile: unknown;
  votes: VoteSummary;
};

const scenarioOptions: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'conservative', label: 'Bearish' },
  { key: 'base', label: 'Base' },
  { key: 'aggressive', label: 'Bullish' },
];

const defaultScenarioAnalyses: Record<ScenarioKey, ScenarioAnalysis> = {
  conservative: { growthRate: '0.04', analysis: '', likelihood: '30' },
  base: { growthRate: '0.08', analysis: '', likelihood: '40' },
  aggressive: { growthRate: '0.12', analysis: '', likelihood: '30' },
};

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '—';

  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseNumericInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  return Number(normalized);
}

function parseLikelihoodPercent(value: string): number {
  const parsed = parseNumericInput(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function formatLikelihood(value: string): string {
  const normalized = parseLikelihoodPercent(value);
  const rounded = Math.round(normalized * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function formatGrowthRatePercent(value: string): string {
  const parsed = parseNumericInput(value);
  if (Number.isNaN(parsed)) return '—';

  const percent = parsed * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function isScenarioKey(value: string): value is ScenarioKey {
  return value === 'conservative' || value === 'base' || value === 'aggressive';
}

function sanitizeScenarioAnalysis(value: unknown, fallback: ScenarioAnalysis): ScenarioAnalysis {
  if (!value || typeof value !== 'object') return fallback;

  const raw = value as Partial<ScenarioAnalysis>;
  return {
    growthRate: typeof raw.growthRate === 'string' ? raw.growthRate : fallback.growthRate,
    analysis: typeof raw.analysis === 'string' ? raw.analysis : fallback.analysis,
    likelihood: typeof raw.likelihood === 'string' ? raw.likelihood : fallback.likelihood,
  };
}

function sanitizePublishedFile(value: unknown): PublishedAnalysisFile | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Partial<PublishedAnalysisFile>;
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
  if (!symbol) return null;

  const companyName = typeof raw.companyName === 'string' && raw.companyName.trim()
    ? raw.companyName.trim()
    : symbol;
  const publishedAt = typeof raw.publishedAt === 'string' ? raw.publishedAt : '';
  const casesSummary = typeof raw.casesSummary === 'string' ? raw.casesSummary : '';
  const activeScenario = typeof raw.activeScenario === 'string' && isScenarioKey(raw.activeScenario)
    ? raw.activeScenario
    : 'base';

  const scenarioAnalyses = {
    conservative: sanitizeScenarioAnalysis(raw.scenarioAnalyses?.conservative, defaultScenarioAnalyses.conservative),
    base: sanitizeScenarioAnalysis(raw.scenarioAnalyses?.base, defaultScenarioAnalyses.base),
    aggressive: sanitizeScenarioAnalysis(raw.scenarioAnalyses?.aggressive, defaultScenarioAnalyses.aggressive),
  };

  const savedDcfPrice = typeof raw.savedDcfPrice === 'number' && Number.isFinite(raw.savedDcfPrice)
    ? raw.savedDcfPrice
    : null;
  const savedDcfAt = typeof raw.savedDcfAt === 'string' ? raw.savedDcfAt : '';

  return {
    symbol,
    companyName,
    publishedAt,
    scenarioAnalyses,
    casesSummary,
    activeScenario,
    savedDcfPrice,
    savedDcfAt,
  };
}

export default function PublicAnalysisReviewPage() {
  const { user, isSignedIn } = useUser();
  const params = useParams<{ symbol: string; authorId: string }>();

  const symbol = decodeURIComponent(params.symbol || '').trim().toUpperCase();
  const authorId = decodeURIComponent(params.authorId || '').trim();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<PublicReview | null>(null);
  const [voteError, setVoteError] = useState('');
  const [voteStatus, setVoteStatus] = useState('');
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);

  useEffect(() => {
    if (!symbol || !authorId) {
      setError('Invalid public review link.');
      setIsLoading(false);
      return;
    }

    const loadReview = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/analysis/public/${encodeURIComponent(symbol)}/${encodeURIComponent(authorId)}`, {
          cache: 'no-store',
        });
        const data = await response.json();

        if (!response.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Failed to load public review.');
          setReview(null);
          return;
        }

        if (!data?.review || typeof data.review !== 'object') {
          setError('Public review not found.');
          setReview(null);
          return;
        }

        setReview(data.review as PublicReview);
      } catch (loadError) {
        console.error('Failed to load public analysis review', loadError);
        setError('Failed to load public review. Please try again.');
        setReview(null);
      } finally {
        setIsLoading(false);
      }
    };

    void loadReview();
  }, [symbol, authorId]);

  const publishedFile = useMemo(() => sanitizePublishedFile(review?.publishedFile), [review?.publishedFile]);

  const orderedScenarioOptions = useMemo(() => {
    if (!publishedFile) return [...scenarioOptions];

    return [...scenarioOptions].sort((a, b) => {
      const likelihoodA = parseLikelihoodPercent(publishedFile.scenarioAnalyses[a.key]?.likelihood || '0');
      const likelihoodB = parseLikelihoodPercent(publishedFile.scenarioAnalyses[b.key]?.likelihood || '0');

      if (likelihoodA === likelihoodB) {
        return scenarioOptions.findIndex((option) => option.key === a.key)
          - scenarioOptions.findIndex((option) => option.key === b.key);
      }

      return likelihoodB - likelihoodA;
    });
  }, [publishedFile]);

  const submitVote = async (targetVote: 1 | -1) => {
    if (!review || isSubmittingVote) return;

    if (!isSignedIn) {
      setVoteError('Sign in to vote on public reviews.');
      return;
    }

    setVoteError('');
    setVoteStatus('Saving vote...');
    setIsSubmittingVote(true);

    const desiredVote = review.votes.userVote === targetVote ? 0 : targetVote;

    try {
      const response = await fetch(`/api/analysis/public/${encodeURIComponent(review.symbol)}/${encodeURIComponent(review.reviewUserId)}/vote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: desiredVote }),
      });
      const data = await response.json();

      if (!response.ok) {
        setVoteError(typeof data?.error === 'string' ? data.error : 'Failed to save vote.');
        setVoteStatus('');
        return;
      }

      if (data?.votes && typeof data.votes === 'object') {
        setReview((prev) => (prev
          ? {
              ...prev,
              votes: data.votes as VoteSummary,
            }
          : prev));
      }

      setVoteStatus('Vote saved');
      setTimeout(() => setVoteStatus(''), 1200);
    } catch (voteRequestError) {
      console.error('Failed to submit vote', voteRequestError);
      setVoteError('Failed to save vote. Please try again.');
      setVoteStatus('');
    } finally {
      setIsSubmittingVote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900 py-12 px-4 font-sans text-slate-100">
        <div className="max-w-[900px] mx-auto bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
          <p className="text-sm font-semibold text-blue-100/90">Loading public review…</p>
        </div>
      </div>
    );
  }

  if (error || !review || !publishedFile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900 py-12 px-4 font-sans text-slate-100">
        <div className="max-w-[900px] mx-auto bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
          <h1 className="text-2xl font-black tracking-tight">Public Review Unavailable</h1>
          <p className="text-sm text-blue-100/90 mt-3">{error || 'This review could not be loaded.'}</p>
          <Link
            href="/analysis"
            className="inline-block mt-6 px-5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
          >
            Back to Filings
          </Link>
        </div>
      </div>
    );
  }

  const mostLikelyScenario = orderedScenarioOptions[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900 py-8 px-4 font-sans text-slate-100">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200/85">Community Review</p>

          <div className="flex items-center gap-2">
            {user?.id === review.reviewUserId && (
              <Link
                href={`/analysis/${encodeURIComponent(review.symbol)}`}
                className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
              >
                Edit My File
              </Link>
            )}
            <Link
              href="/analysis"
              className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
            >
              Back to Filings
            </Link>
          </div>
        </div>

        <article className="mx-auto max-w-[900px] bg-slate-900/70 border border-white/10 rounded-2xl shadow-sm backdrop-blur-md px-10 py-12">
          <header className="border-b border-white/10 pb-7 mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-blue-50">{publishedFile.symbol}</h1>
            <p className="mt-2 text-lg text-blue-100/90">{publishedFile.companyName || review.companyName}</p>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-[13px] text-blue-100/80">
              <p>
                <span className="font-semibold text-blue-200">Published:</span>{' '}
                {formatDateTime(publishedFile.publishedAt || review.publishedAt)}
              </p>
              <p>
                <span className="font-semibold text-blue-200">Publisher:</span>{' '}
                {review.authorLabel || 'Publisher'}
              </p>
              <p>
                <span className="font-semibold text-blue-200">Most Likely:</span>{' '}
                {mostLikelyScenario?.label || 'Base'}
              </p>
              <p>
                <span className="font-semibold text-blue-200">Saved DCF:</span>{' '}
                {publishedFile.savedDcfPrice !== null ? `$${formatCurrency(publishedFile.savedDcfPrice)}` : '—'}
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-800/35 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85">Scenario Metrics</p>
              <p className="mt-2 text-[12px] text-blue-100/80">
                Projected growth for each of the cases.
              </p>
              <p className="mt-1 text-[12px] text-amber-100/85">
                Disclaimer: Likelihoods are estimates provided by the publisher.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {orderedScenarioOptions.map((option) => {
                  const scenario = publishedFile.scenarioAnalyses[option.key];
                  return (
                    <div key={option.key} className="rounded-lg border border-white/10 bg-slate-900/45 p-3">
                      <p className="text-sm font-semibold text-blue-50">{option.label}</p>
                      <p className="mt-2 text-[12px] text-blue-100/85">
                        <span className="font-semibold text-blue-200">Projected Growth:</span>{' '}
                        {formatGrowthRatePercent(scenario?.growthRate || '')}
                      </p>
                      <p className="mt-1 text-[12px] text-blue-100/85">
                        <span className="font-semibold text-blue-200">Likelihood:</span>{' '}
                        {formatLikelihood(scenario?.likelihood || '0')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-800/35 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85">Community Voting</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void submitVote(1)}
                  disabled={isSubmittingVote}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-60 ${
                    review.votes.userVote === 1
                      ? 'border-emerald-300/35 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/20 bg-white/10 text-blue-100 hover:bg-white/15'
                  }`}
                >
                  Upvote
                </button>
                <button
                  onClick={() => void submitVote(-1)}
                  disabled={isSubmittingVote}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-60 ${
                    review.votes.userVote === -1
                      ? 'border-rose-300/35 bg-rose-500/20 text-rose-100'
                      : 'border-white/20 bg-white/10 text-blue-100 hover:bg-white/15'
                  }`}
                >
                  Downvote
                </button>

                <p className="text-[12px] text-blue-100/90 font-semibold">
                  Score {review.votes.score} · ▲ {review.votes.upvotes} · ▼ {review.votes.downvotes}
                </p>
              </div>

              {voteStatus && <p className="mt-2 text-[12px] text-emerald-200/90 font-semibold">{voteStatus}</p>}
              {voteError && <p className="mt-2 text-[12px] text-rose-200/90 font-semibold">{voteError}</p>}
            </div>
          </header>

          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85">Analysis</h2>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-[15px] text-blue-50/95">
              {publishedFile.casesSummary?.trim() || 'No analysis was included in this published file.'}
            </p>
          </section>

          <section className="mt-10 space-y-8">
            {orderedScenarioOptions.map((option) => {
              const scenario = publishedFile.scenarioAnalyses[option.key];

              return (
                <div key={option.key} className="border-t border-white/10 pt-6">
                  <h3 className="text-xl font-semibold text-blue-50">{option.label} Scenario</h3>

                  <p className="mt-3 whitespace-pre-wrap leading-7 text-[15px] text-blue-50/95">
                    {scenario?.analysis?.trim() || 'No write-up was provided for this scenario.'}
                  </p>
                </div>
              );
            })}
          </section>
        </article>
      </div>
    </div>
  );
}
