'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

type ScenarioKey = 'conservative' | 'base' | 'aggressive';

type ScenarioAnalysis = {
  growthRate: string;
  analysis: string;
  likelihood?: string;
};

type BusinessSegment = {
  name: string;
  revenue: string;
  operatingIncome: string;
  growth: string;
  growthBear?: string;
  growthBull?: string;
};

type EpsDataPoint = {
  year: string;
  eps: string;
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
  segments?: BusinessSegment[];
  epsHistory?: EpsDataPoint[];
  epsPeMultiple?: string;
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

const SEGMENT_PALETTE = ['#60A5FA', '#A78BFA', '#34D399', '#F59E0B', '#F472B6', '#38BDF8', '#F87171'];

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNumericInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  return Number(trimmed.replace(/\s+/g, '').replace(',', '.'));
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

function sanitizeSegments(value: unknown): BusinessSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((raw) => ({
      name: typeof raw.name === 'string' ? raw.name : '',
      revenue: typeof raw.revenue === 'string' ? raw.revenue : '',
      operatingIncome: typeof raw.operatingIncome === 'string' ? raw.operatingIncome : '',
      growth: typeof raw.growth === 'string' ? raw.growth : '',
      growthBear: typeof raw.growthBear === 'string' ? raw.growthBear : '',
      growthBull: typeof raw.growthBull === 'string' ? raw.growthBull : '',
    }))
    .filter((s) => s.name.trim().length > 0);
}

function sanitizeEpsHistory(value: unknown): EpsDataPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((raw) => ({
      year: typeof raw.year === 'string' ? raw.year : '',
      eps: typeof raw.eps === 'string' ? raw.eps : '',
    }))
    .filter((p) => p.year.trim().length > 0);
}

function sanitizePublishedFile(value: unknown): PublishedAnalysisFile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PublishedAnalysisFile>;
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
  if (!symbol) return null;

  const companyName = typeof raw.companyName === 'string' && raw.companyName.trim() ? raw.companyName.trim() : symbol;
  const publishedAt = typeof raw.publishedAt === 'string' ? raw.publishedAt : '';
  const casesSummary = typeof raw.casesSummary === 'string' ? raw.casesSummary : '';
  const activeScenario = typeof raw.activeScenario === 'string' && isScenarioKey(raw.activeScenario) ? raw.activeScenario : 'base';

  const scenarioAnalyses = {
    conservative: sanitizeScenarioAnalysis(raw.scenarioAnalyses?.conservative, defaultScenarioAnalyses.conservative),
    base: sanitizeScenarioAnalysis(raw.scenarioAnalyses?.base, defaultScenarioAnalyses.base),
    aggressive: sanitizeScenarioAnalysis(raw.scenarioAnalyses?.aggressive, defaultScenarioAnalyses.aggressive),
  };

  const savedDcfPrice = typeof raw.savedDcfPrice === 'number' && Number.isFinite(raw.savedDcfPrice) ? raw.savedDcfPrice : null;
  const savedDcfAt = typeof raw.savedDcfAt === 'string' ? raw.savedDcfAt : '';

  return {
    symbol, companyName, publishedAt, scenarioAnalyses, casesSummary, activeScenario,
    savedDcfPrice, savedDcfAt,
    segments: sanitizeSegments(raw.segments),
    epsHistory: sanitizeEpsHistory(raw.epsHistory),
    epsPeMultiple: typeof raw.epsPeMultiple === 'string' ? raw.epsPeMultiple : '',
  };
}

// ── Chart components (same as filing view) ──────────────────────────────────

function SegmentPieChart({ title, slices }: { title: string; slices: Array<{ name: string; value: number }> }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const radius = 90;
  const center = radius;
  let cumulative = 0;

  const paths = slices.map((s, idx) => {
    const startAngle = (2 * Math.PI * cumulative) / total - Math.PI / 2;
    const endAngle = (2 * Math.PI * (cumulative + s.value)) / total - Math.PI / 2;
    cumulative += s.value;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const color = SEGMENT_PALETTE[idx % SEGMENT_PALETTE.length];
    return <path key={idx} d={`M${center},${center} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`} fill={color} />;
  });

  return (
    <div className="flex flex-col items-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-blue-200/85 mb-3">{title}</p>
      <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
        {paths}
        <circle cx={center} cy={center} r={36} fill="#0F172A" stroke="#1E293B" strokeWidth="1" />
      </svg>
      <div className="mt-3 w-full space-y-1.5">
        {slices.map((s, idx) => {
          const pct = ((s.value / total) * 100).toFixed(1);
          const label = s.value >= 1000 ? `$${(s.value / 1000).toFixed(1)}B` : `$${s.value.toFixed(0)}M`;
          return (
            <div key={s.name} className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEGMENT_PALETTE[idx % SEGMENT_PALETTE.length] }} />
                <span className="text-[12px] font-medium text-slate-200 truncate">{s.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[12px] font-semibold text-blue-200">{pct}%</span>
                <span className="text-[11px] text-blue-100/60">{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SegmentCharts({ segments, activeScenario }: { segments: BusinessSegment[]; activeScenario: ScenarioKey }) {
  const [viewYear, setViewYear] = useState<0 | 5 | 10>(0);

  const getGrowth = (s: BusinessSegment): string => {
    if (activeScenario === 'conservative') return s.growthBear?.trim() ? s.growthBear : s.growth;
    if (activeScenario === 'aggressive') return s.growthBull?.trim() ? s.growthBull : s.growth;
    return s.growth;
  };

  const hasGrowthData = segments.some((s) => {
    const g = Number(getGrowth(s));
    return getGrowth(s).trim() !== '' && Number.isFinite(g);
  });

  const project = (base: number, growthStr: string, years: number): number => {
    if (years === 0) return base;
    const g = Number(growthStr) / 100;
    return Number.isFinite(g) ? base * (1 + g) ** years : base;
  };

  const revenueSlices = segments
    .map((s) => ({ name: s.name.trim(), value: project(Number(s.revenue), getGrowth(s), viewYear) }))
    .filter((s) => s.name && Number.isFinite(s.value) && s.value > 0);

  const opIncomeSlices = segments
    .map((s) => ({ name: s.name.trim(), value: project(Number(s.operatingIncome), getGrowth(s), viewYear) }))
    .filter((s) => s.name && Number.isFinite(s.value) && s.value > 0);

  if (revenueSlices.length === 0 && opIncomeSlices.length === 0) return null;

  const yearLabel = viewYear === 0 ? 'Now' : `+${viewYear}yr`;

  return (
    <div>
      {hasGrowthData && (
        <div className="flex items-center gap-1.5 mb-4">
          {([0, 5, 10] as const).map((yr) => (
            <button
              key={yr}
              onClick={() => setViewYear(yr)}
              className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                viewYear === yr
                  ? 'bg-blue-600/25 border-blue-400/40 text-blue-100'
                  : 'bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10 hover:text-blue-200'
              }`}
            >
              {yr === 0 ? 'Now' : `+${yr}yr`}
            </button>
          ))}
        </div>
      )}
      <div className={`grid gap-8 ${opIncomeSlices.length > 0 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
        {revenueSlices.length > 0 && (
          <SegmentPieChart
            title={`Revenue by Segment${viewYear > 0 ? ` (${yearLabel} Projected)` : ''}`}
            slices={revenueSlices}
          />
        )}
        {opIncomeSlices.length > 0 && (
          <SegmentPieChart
            title={`Op. Income by Segment${viewYear > 0 ? ` (${yearLabel} Projected)` : ''}`}
            slices={opIncomeSlices}
          />
        )}
      </div>
    </div>
  );
}

function EpsChart({
  history, scenarioAnalyses, peMultiple, activeScenario,
}: {
  history: EpsDataPoint[];
  scenarioAnalyses: Record<ScenarioKey, ScenarioAnalysis>;
  peMultiple: string;
  activeScenario: ScenarioKey;
}) {
  const [mode, setMode] = useState<'eps' | 'price'>('eps');

  const validHistory = history
    .filter((p) => p.year.trim() && p.eps.trim() && Number.isFinite(Number(p.eps)))
    .sort((a, b) => Number(a.year) - Number(b.year));

  if (validHistory.length === 0) return null;

  const pe = Number(peMultiple);
  const hasPe = Number.isFinite(pe) && pe > 0;

  const lastHistYear = Number(validHistory[validHistory.length - 1].year);
  const lastHistEps = Number(validHistory[validHistory.length - 1].eps);

  const PROJECTION_YEARS = 5;
  const scenarioColors: Record<ScenarioKey, string> = {
    conservative: '#F87171', base: '#60A5FA', aggressive: '#34D399',
  };

  const buildProjection = (key: ScenarioKey): { year: number; value: number }[] => {
    const g = Number(scenarioAnalyses[key].growthRate) / 100;
    if (!Number.isFinite(g)) return [];
    return Array.from({ length: PROJECTION_YEARS + 1 }, (_, i) => {
      const eps = lastHistEps * (1 + g) ** i;
      return { year: lastHistYear + i, value: mode === 'price' && hasPe ? eps * pe : eps };
    });
  };

  const toValue = (eps: number) => (mode === 'price' && hasPe ? eps * pe : eps);
  const histPoints = validHistory.map((p) => ({ year: Number(p.year), value: toValue(Number(p.eps)) }));
  const projPoints = buildProjection(activeScenario);

  const allValues = [...histPoints.map((p) => p.value), ...projPoints.map((p) => p.value)];
  const allYears = [...histPoints.map((p) => p.year), ...projPoints.map((p) => p.year)];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);

  const W = 480; const H = 180;
  const PAD = { top: 14, right: 16, bottom: 28, left: 46 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const valRange = maxVal - minVal || 1;
  const yearRange = maxYear - minYear || 1;

  const toX = (year: number) => PAD.left + ((year - minYear) / yearRange) * chartW;
  const toY = (val: number) => PAD.top + chartH - ((val - minVal) / valRange) * chartH;
  const polyline = (pts: { year: number; value: number }[]) => pts.map((p) => `${toX(p.year)},${toY(p.value)}`).join(' ');
  const color = scenarioColors[activeScenario];
  const yTicks = 4;
  const xTicks = Array.from(new Set(allYears)).filter((y) => Number.isInteger(y));

  return (
    <div>
      <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
        {hasPe && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMode('eps')} className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all ${mode === 'eps' ? 'bg-blue-600/25 border-blue-400/40 text-blue-100' : 'bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10 hover:text-blue-200'}`}>EPS</button>
            <button onClick={() => setMode('price')} className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all ${mode === 'price' ? 'bg-blue-600/25 border-blue-400/40 text-blue-100' : 'bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10 hover:text-blue-200'}`}>EPS × PE = Price</button>
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = minVal + (valRange / yTicks) * i;
          const y = toY(val);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="#FFFFFF10" strokeWidth="1" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fill="#94A3B8" fontSize="9">
                {mode === 'price' ? `$${val.toFixed(0)}` : `$${val.toFixed(2)}`}
              </text>
            </g>
          );
        })}
        {xTicks.map((yr) => (
          <text key={yr} x={toX(yr)} y={PAD.top + chartH + 16} textAnchor="middle" fill="#94A3B8" fontSize="9">{yr}</text>
        ))}
        {histPoints.length > 1 && <polyline points={polyline(histPoints)} fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinejoin="round" />}
        {histPoints.map((p) => <circle key={p.year} cx={toX(p.year)} cy={toY(p.value)} r={3.5} fill="#E2E8F0" />)}
        {projPoints.length > 1 && <polyline points={polyline(projPoints)} fill="none" stroke={color} strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />}
        {projPoints.slice(1).map((p) => <circle key={p.year} cx={toX(p.year)} cy={toY(p.value)} r={3} fill={color} />)}
        {histPoints.length > 0 && projPoints.length > 0 && (
          <line x1={toX(lastHistYear)} y1={PAD.top} x2={toX(lastHistYear)} y2={PAD.top + chartH} stroke="#FFFFFF20" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[10px] text-blue-100/50">
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0.5 bg-slate-200 rounded" />Historical</span>
        <span className="flex items-center gap-1.5" style={{ color }}>
          <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: color, borderTop: `2px dashed ${color}`, background: 'none' }} />
          {activeScenario.charAt(0).toUpperCase() + activeScenario.slice(1)} Projected
        </span>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicAnalysisReviewPage() {
  const { user, isSignedIn } = useUser();
  const params = useParams<{ symbol: string; authorId: string }>();

  const symbol = decodeURIComponent(params.symbol || '').trim().toUpperCase();
  const authorId = decodeURIComponent(params.authorId || '').trim();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<PublicReview | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>('base');
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
        const response = await fetch(
          `/api/analysis/public/${encodeURIComponent(symbol)}/${encodeURIComponent(authorId)}`,
          { cache: 'no-store' },
        );
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

        const r = data.review as PublicReview;
        setReview(r);

        const file = sanitizePublishedFile(r.publishedFile);
        if (file && isScenarioKey(file.activeScenario)) {
          setActiveScenario(file.activeScenario);
        }
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

  const submitVote = async (targetVote: 1 | -1) => {
    if (!review || isSubmittingVote) return;
    if (!isSignedIn) { setVoteError('Sign in to vote on public reviews.'); return; }

    setVoteError('');
    setVoteStatus('Saving vote...');
    setIsSubmittingVote(true);

    const desiredVote = review.votes.userVote === targetVote ? 0 : targetVote;

    try {
      const response = await fetch(
        `/api/analysis/public/${encodeURIComponent(review.symbol)}/${encodeURIComponent(review.reviewUserId)}/vote`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vote: desiredVote }) },
      );
      const data = await response.json();

      if (!response.ok) {
        setVoteError(typeof data?.error === 'string' ? data.error : 'Failed to save vote.');
        setVoteStatus('');
        return;
      }

      if (data?.votes && typeof data.votes === 'object') {
        setReview((prev) => prev ? { ...prev, votes: data.votes as VoteSummary } : prev);
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
      <div className="min-h-screen bg-market-mesh py-12 px-4 font-sans text-slate-100">
        <div className="max-w-[900px] mx-auto bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
          <p className="text-sm font-semibold text-blue-100/90">Loading public review…</p>
        </div>
      </div>
    );
  }

  if (error || !review || !publishedFile) {
    return (
      <div className="min-h-screen bg-market-mesh py-12 px-4 font-sans text-slate-100">
        <div className="max-w-[900px] mx-auto bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
          <h1 className="text-2xl font-black tracking-tight">Public Review Unavailable</h1>
          <p className="text-sm text-blue-100/90 mt-3">{error || 'This review could not be loaded.'}</p>
          <Link href="/analysis" className="inline-block mt-6 px-5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all">
            Back to Filings
          </Link>
        </div>
      </div>
    );
  }

  const activeScenarioData = publishedFile.scenarioAnalyses[activeScenario];
  const activeScenarioLabel = scenarioOptions.find((o) => o.key === activeScenario)?.label || 'Scenario';

  return (
    <div className="min-h-screen bg-market-mesh py-8 px-4 font-sans text-slate-100">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200/85">Community Review</p>
          <div className="flex items-center gap-2">
            {user?.id === review.reviewUserId && (
              <Link href={`/analysis/${encodeURIComponent(review.symbol)}`} className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all">
                Edit My File
              </Link>
            )}
            <Link href="/analysis" className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all">
              Back to Filings
            </Link>
          </div>
        </div>

        <article className="mx-auto max-w-[900px] bg-slate-900/70 border border-white/10 rounded-2xl shadow-sm backdrop-blur-md px-10 py-12">
          <header className="border-b border-white/10 pb-7 mb-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-blue-50">{publishedFile.symbol}</h1>
                <p className="mt-2 text-lg text-blue-100/90">{publishedFile.companyName || review.companyName}</p>
                <div className="mt-3 text-[13px] text-blue-100/80 space-y-0.5">
                  <p><span className="font-semibold text-blue-200">Published:</span> {formatDateTime(publishedFile.publishedAt || review.publishedAt)}</p>
                  <p><span className="font-semibold text-blue-200">Publisher:</span> {review.authorLabel || 'Publisher'}</p>
                  <p><span className="font-semibold text-blue-200">Saved DCF:</span> {publishedFile.savedDcfPrice !== null ? `$${formatCurrency(publishedFile.savedDcfPrice)}` : '—'}</p>
                </div>
              </div>

              {/* Scenario toggle — same style as filing view */}
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 p-1.5 shadow-sm self-start">
                {scenarioOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setActiveScenario(option.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-semibold border shadow-sm transition-all ${
                      option.key === 'conservative'
                        ? activeScenario === option.key
                          ? 'bg-rose-500/20 text-rose-100 border-rose-300/40 ring-1 ring-rose-300/25'
                          : 'bg-rose-500/5 text-rose-200/85 border-rose-300/20 hover:bg-rose-500/10'
                        : option.key === 'base'
                          ? activeScenario === option.key
                            ? 'bg-amber-500/20 text-amber-100 border-amber-300/40 ring-1 ring-amber-300/25'
                            : 'bg-amber-500/5 text-amber-100/85 border-amber-300/20 hover:bg-amber-500/10'
                          : activeScenario === option.key
                            ? 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40 ring-1 ring-emerald-300/25'
                            : 'bg-emerald-500/5 text-emerald-100/85 border-emerald-300/20 hover:bg-emerald-500/10'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-4 text-[13px]">
              <span className="text-blue-200/70">
                Growth: <span className="font-semibold text-blue-100">{formatGrowthRatePercent(activeScenarioData?.growthRate || '')}</span>
              </span>
            </div>

            {/* Community voting */}
            <div className="mt-6 rounded-xl border border-white/10 bg-slate-800/35 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85">Community Voting</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void submitVote(1)}
                  disabled={isSubmittingVote}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-60 ${review.votes.userVote === 1 ? 'border-emerald-300/35 bg-emerald-500/20 text-emerald-100' : 'border-white/20 bg-white/10 text-blue-100 hover:bg-white/15'}`}
                >
                  Upvote
                </button>
                <button
                  onClick={() => void submitVote(-1)}
                  disabled={isSubmittingVote}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-60 ${review.votes.userVote === -1 ? 'border-rose-300/35 bg-rose-500/20 text-rose-100' : 'border-white/20 bg-white/10 text-blue-100 hover:bg-white/15'}`}
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

          {/* EPS Analysis — same as filing view */}
          {publishedFile.epsHistory && publishedFile.epsHistory.some((p) => p.year.trim() && p.eps.trim()) && (
            <section className="mb-10">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-6">EPS Analysis</h2>
              <EpsChart
                history={publishedFile.epsHistory}
                scenarioAnalyses={publishedFile.scenarioAnalyses}
                peMultiple={publishedFile.epsPeMultiple ?? ''}
                activeScenario={activeScenario}
              />
            </section>
          )}

          {/* Business Segments — same as filing view */}
          {publishedFile.segments && publishedFile.segments.length > 0 && (
            <section className="mb-10">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-6">Business Segments</h2>
              <SegmentCharts segments={publishedFile.segments} activeScenario={activeScenario} />
            </section>
          )}

          {/* Main analysis write-up */}
          {publishedFile.casesSummary?.trim() && (
            <section className="mb-10">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-4">Analysis</h2>
              <p className="whitespace-pre-wrap leading-7 text-[15px] text-blue-50/95">
                {publishedFile.casesSummary.trim()}
              </p>
            </section>
          )}

          {/* Active scenario write-up — same as filing view */}
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-4">
              {activeScenarioLabel} Analysis
            </h2>
            <p className="whitespace-pre-wrap leading-7 text-[15px] text-blue-50/95">
              {activeScenarioData?.analysis?.trim() || 'No write-up was provided for this scenario.'}
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
