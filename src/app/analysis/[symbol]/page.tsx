'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { calculateDCF } from '../../../lib/dcf';

type PriceResponse = {
  currentPrice?: number;
  companyName?: string;
  logo?: string;
  fundamentals?: FundamentalsSnapshot;
};

type FundamentalsSnapshot = {
  currentPe: number | null;
  dividendYield: number | null;
};

type ScenarioKey = 'conservative' | 'base' | 'aggressive';

type ScenarioAnalysis = {
  growthRate: string;
  analysis: string;
};

type Draft = {
  scenarioAnalyses: Record<ScenarioKey, ScenarioAnalysis>;
  casesSummary?: string;
  publicReviewOptIn?: boolean;
  activeScenario: ScenarioKey;
  fcf: string;
  sharesOutstanding: string;
  cashEquivalent: string;
  totalDebt: string;
  discountRate: string;
  terminalGrowth: string;
  years: string;
  savedDcfPrice: number | null;
  savedDcfAt: string;
  publishedFile?: PublishedAnalysisFile;
  thesis?: string;
  growthRate?: string;
  segments?: BusinessSegment[];
  epsHistory?: EpsDataPoint[];
  epsPeMultiple?: string;
};

type BusinessSegment = {
  name: string;
  revenue: string;
  operatingIncome: string;
  growth: string;       // base case growth
  growthBear?: string;  // conservative case override
  growthBull?: string;  // aggressive case override
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

type DraftRecoverySnapshot = {
  draft: Draft;
  companyName: string;
  updatedAt: string;
};

type FilingRecord = {
  symbol: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  hasPublished?: boolean;
};

type StorageMode = 'unknown' | 'database' | 'local';

const FILINGS_KEY = 'portfo_stock_analysis_filings_v1';
const ANALYSIS_DRAFT_KEY_PREFIX = 'portfo_stock_analysis_draft_v1_';
const ACCOUNT_ANALYSIS_DRAFT_BACKUP_PREFIX = 'portfo_account_analysis_draft_backup_v1_';

const defaultAssumptions = {
  discountRate: '0.10',
  terminalGrowth: '0.025',
  years: '5',
};

const PROJECTED_GROWTH_SPREAD = 0.2;

const defaultScenarioAnalyses: Record<ScenarioKey, ScenarioAnalysis> = {
  conservative: { growthRate: '0.04', analysis: '' },
  base: { growthRate: '0.08', analysis: '' },
  aggressive: { growthRate: '0.12', analysis: '' },
};

const scenarioOptions: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'conservative', label: 'Bearish' },
  { key: 'base', label: 'Base' },
  { key: 'aggressive', label: 'Bullish' },
];

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

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

function formatRate(value: number) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded);
}

function parseNumericInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  return Number(normalized);
}

function formatGrowthRatePercent(value: string): string {
  const parsed = parseNumericInput(value);
  if (Number.isNaN(parsed)) return '—';

  const percent = parsed * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function formatMetricValue(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatMetricPercent(
  value: number | null | undefined,
  maximumFractionDigits = 2,
  minimumFractionDigits = 0,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  })}%`;
}

function sanitizeScenarioAnalysis(value: unknown, fallback: ScenarioAnalysis): ScenarioAnalysis {
  if (!value || typeof value !== 'object') return fallback;

  const raw = value as Partial<ScenarioAnalysis>;
  const growthRate = typeof raw.growthRate === 'string' ? raw.growthRate : fallback.growthRate;
  const analysis = typeof raw.analysis === 'string' ? raw.analysis : fallback.analysis;

  return { growthRate, analysis };
}

function isScenarioKey(value: string): value is ScenarioKey {
  return value === 'conservative' || value === 'base' || value === 'aggressive';
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
    segments: sanitizeSegments(raw.segments),
    epsHistory: sanitizeEpsHistory(raw.epsHistory),
    epsPeMultiple: typeof raw.epsPeMultiple === 'string' ? raw.epsPeMultiple : '',
  };
}

function updateLocalFilingsRecord(symbol: string, companyName: string, publishedAt?: string) {
  if (!symbol) return;

  try {
    const raw = localStorage.getItem(FILINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as FilingRecord[]) : [];
    const normalized = Array.isArray(parsed) ? parsed : [];
    const now = new Date().toISOString();

    const existing = normalized.find((item) => item.symbol === symbol);
    const normalizedPublishedAt = typeof publishedAt === 'string' ? publishedAt : '';
    const next: FilingRecord = {
      symbol,
      companyName: companyName || existing?.companyName || symbol,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      publishedAt: normalizedPublishedAt || existing?.publishedAt || '',
      hasPublished: Boolean(normalizedPublishedAt || existing?.publishedAt),
    };

    const withoutSymbol = normalized.filter((item) => item.symbol !== symbol);
    localStorage.setItem(FILINGS_KEY, JSON.stringify([next, ...withoutSymbol]));
  } catch (error) {
    console.error('Failed to update local filings table', error);
  }
}

export default function AnalysisSymbolPage() {
  const { user, isSignedIn, isLoaded: isUserLoaded } = useUser();
  const params = useParams<{ symbol: string }>();
  const searchParams = useSearchParams();
  const analysisSymbol = decodeURIComponent(params.symbol || '').trim().toUpperCase();
  const isViewMode = searchParams.get('view') === '1';
  const previousAuthStateRef = useRef<boolean | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [fundamentals, setFundamentals] = useState<FundamentalsSnapshot | null>(null);

  const [fcf, setFcf] = useState('');
  const [shares, setShares] = useState('');
  const [cash, setCash] = useState('');
  const [debt, setDebt] = useState('');

  const [activeScenario, setActiveScenario] = useState<ScenarioKey>('base');
  const [scenarioAnalyses, setScenarioAnalyses] = useState<Record<ScenarioKey, ScenarioAnalysis>>(defaultScenarioAnalyses);
  const [casesSummary, setCasesSummary] = useState('');
  const [discountRate, setDiscountRate] = useState(defaultAssumptions.discountRate);
  const [terminalGrowth, setTerminalGrowth] = useState(defaultAssumptions.terminalGrowth);
  const [years, setYears] = useState(defaultAssumptions.years);

  const [showDcfInputs, setShowDcfInputs] = useState(false);
  const [savedDcfPrice, setSavedDcfPrice] = useState<number | null>(null);
  const [savedDcfAt, setSavedDcfAt] = useState('');
  const [publicReviewOptIn, setPublicReviewOptIn] = useState(false);
  const [saveDcfStatus, setSaveDcfStatus] = useState('Save DCF Price');
  const [saveStatus, setSaveStatus] = useState('Save');
  const [storageMode, setStorageMode] = useState<StorageMode>('unknown');
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [publishedFile, setPublishedFile] = useState<PublishedAnalysisFile | null>(null);
  const [segments, setSegments] = useState<BusinessSegment[]>([]);
  const [epsHistory, setEpsHistory] = useState<EpsDataPoint[]>([]);
  const [epsPeMultiple, setEpsPeMultiple] = useState('');

  const activeScenarioData = scenarioAnalyses[activeScenario];
  const activeScenarioLabel = scenarioOptions.find((option) => option.key === activeScenario)?.label || 'Scenario';
  const defaultSaveLabel = 'Save';

  const draftKey = useMemo(() => `${ANALYSIS_DRAFT_KEY_PREFIX}${analysisSymbol}`, [analysisSymbol]);

  const getAccountDraftBackupKey = (userId: string, symbol: string) =>
    `${ACCOUNT_ANALYSIS_DRAFT_BACKUP_PREFIX}${userId}_${symbol.trim().toUpperCase()}`;

  const saveAccountDraftBackup = (userId: string, symbol: string, draft: Draft, fallbackCompanyName: string) => {
    try {
      const snapshot: DraftRecoverySnapshot = {
        draft,
        companyName: fallbackCompanyName.trim() || symbol,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(getAccountDraftBackupKey(userId, symbol), JSON.stringify(snapshot));
    } catch (error) {
      console.error('Failed to save account analysis draft backup', error);
    }
  };

  const loadAccountDraftBackup = (userId: string, symbol: string): DraftRecoverySnapshot | null => {
    try {
      const raw = localStorage.getItem(getAccountDraftBackupKey(userId, symbol));
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<DraftRecoverySnapshot>;
      if (!parsed?.draft || typeof parsed.draft !== 'object') return null;

      return {
        draft: parsed.draft as Draft,
        companyName: typeof parsed.companyName === 'string' ? parsed.companyName : symbol,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      };
    } catch (error) {
      console.error('Failed to load account analysis draft backup', error);
      return null;
    }
  };

  const createDraftPayload = (
    params?: {
      publishedOverride?: PublishedAnalysisFile | null;
    },
  ): Draft => ({
    scenarioAnalyses,
    casesSummary,
    publicReviewOptIn,
    activeScenario,
    fcf,
    sharesOutstanding: shares,
    cashEquivalent: cash,
    totalDebt: debt,
    discountRate,
    terminalGrowth,
    years,
    savedDcfPrice,
    savedDcfAt,
    segments,
    epsHistory,
    epsPeMultiple,
    publishedFile: params?.publishedOverride ?? publishedFile ?? undefined,
  });

  const clearLocalAnalysisData = () => {
    try {
      const rawFilings = localStorage.getItem(FILINGS_KEY);
      if (rawFilings) {
        const parsed = JSON.parse(rawFilings) as Array<{ symbol?: string }>;
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (typeof item?.symbol === 'string' && item.symbol.trim()) {
              localStorage.removeItem(`${ANALYSIS_DRAFT_KEY_PREFIX}${item.symbol.trim().toUpperCase()}`);
            }
          });
        }
      }

      const keysToDelete: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(ANALYSIS_DRAFT_KEY_PREFIX)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem(FILINGS_KEY);
    } catch (error) {
      console.error('Failed to clear local analysis data', error);
    }
  };

  useEffect(() => {
    if (!isUserLoaded) return;

    const wasSignedIn = previousAuthStateRef.current;
    if (wasSignedIn && !isSignedIn) {
      clearLocalAnalysisData();
      setStorageMode('local');
    }

    previousAuthStateRef.current = isSignedIn;
  }, [isSignedIn, isUserLoaded]);

  useEffect(() => {
    setIsDraftHydrated(false);
    setStorageMode('unknown');
    setPublishedFile(null);
    setFcf('');
    setShares('');
    setCash('');
    setDebt('');
    setActiveScenario('base');
    setScenarioAnalyses(defaultScenarioAnalyses);
    setCasesSummary('');
    setPublicReviewOptIn(false);
    setShowDcfInputs(false);
    setSavedDcfPrice(null);
    setSavedDcfAt('');
    setDiscountRate(defaultAssumptions.discountRate);
    setTerminalGrowth(defaultAssumptions.terminalGrowth);
    setYears(defaultAssumptions.years);
    setSegments([]);
    setEpsHistory([]);
    setEpsPeMultiple('');
    setCompanyName('');
    setCompanyLogo('');
    setCurrentPrice(null);
    setLoadError('');

    if (!analysisSymbol || !isUserLoaded) return;

    const applyDraft = (parsed: Draft) => {
      const parsedPublishedFile = sanitizePublishedFile(parsed.publishedFile);
      setPublishedFile(parsedPublishedFile);
      const restoredPublicReviewOptIn = typeof parsed.publicReviewOptIn === 'boolean'
        ? parsed.publicReviewOptIn
        : Boolean(parsedPublishedFile);
      setPublicReviewOptIn(restoredPublicReviewOptIn);

      const restoredSummary = typeof parsed.casesSummary === 'string'
        ? parsed.casesSummary
        : parsedPublishedFile?.casesSummary || '';
      setCasesSummary(restoredSummary);

      if (isViewMode && parsedPublishedFile) {
        if (typeof parsed.fcf === 'string') setFcf(parsed.fcf);
        if (typeof parsed.sharesOutstanding === 'string') setShares(parsed.sharesOutstanding);
        if (typeof parsed.cashEquivalent === 'string') setCash(parsed.cashEquivalent);
        if (typeof parsed.totalDebt === 'string') setDebt(parsed.totalDebt);
        if (parsed.discountRate) setDiscountRate(parsed.discountRate);
        if (parsed.terminalGrowth) setTerminalGrowth(parsed.terminalGrowth);
        if (parsed.years) setYears(parsed.years);

        setScenarioAnalyses(parsedPublishedFile.scenarioAnalyses);
        setActiveScenario(parsedPublishedFile.activeScenario);
        setSavedDcfPrice(parsedPublishedFile.savedDcfPrice);
        setSavedDcfAt(parsedPublishedFile.savedDcfAt);
        setCasesSummary(parsedPublishedFile.casesSummary || restoredSummary);
        setCompanyName(parsedPublishedFile.companyName || analysisSymbol);
        setSegments(sanitizeSegments(parsedPublishedFile.segments));
        setEpsHistory(sanitizeEpsHistory(parsedPublishedFile.epsHistory));
        setEpsPeMultiple(parsedPublishedFile.epsPeMultiple ?? '');
        return;
      }

      let nextScenarios = defaultScenarioAnalyses;
      if (parsed.scenarioAnalyses) {
        nextScenarios = {
          conservative: sanitizeScenarioAnalysis(parsed.scenarioAnalyses.conservative, defaultScenarioAnalyses.conservative),
          base: sanitizeScenarioAnalysis(parsed.scenarioAnalyses.base, defaultScenarioAnalyses.base),
          aggressive: sanitizeScenarioAnalysis(parsed.scenarioAnalyses.aggressive, defaultScenarioAnalyses.aggressive),
        };
      } else {
        nextScenarios = {
          ...defaultScenarioAnalyses,
          base: {
            growthRate: typeof parsed.growthRate === 'string' ? parsed.growthRate : defaultScenarioAnalyses.base.growthRate,
            analysis: typeof parsed.thesis === 'string' ? parsed.thesis : defaultScenarioAnalyses.base.analysis,
          },
        };
      }

      setScenarioAnalyses(nextScenarios);
      if (typeof parsed.activeScenario === 'string' && isScenarioKey(parsed.activeScenario)) {
        setActiveScenario(parsed.activeScenario);
      }

      if (typeof parsed.fcf === 'string') setFcf(parsed.fcf);
      if (typeof parsed.sharesOutstanding === 'string') setShares(parsed.sharesOutstanding);
      if (typeof parsed.cashEquivalent === 'string') setCash(parsed.cashEquivalent);
      if (typeof parsed.totalDebt === 'string') setDebt(parsed.totalDebt);
      if (typeof parsed.savedDcfPrice === 'number' && Number.isFinite(parsed.savedDcfPrice)) {
        setSavedDcfPrice(parsed.savedDcfPrice);
      }
      if (typeof parsed.savedDcfAt === 'string') setSavedDcfAt(parsed.savedDcfAt);
      if (parsed.discountRate) setDiscountRate(parsed.discountRate);
      if (parsed.terminalGrowth) setTerminalGrowth(parsed.terminalGrowth);
      if (parsed.years) setYears(parsed.years);
      setSegments(sanitizeSegments(parsed.segments));
      setEpsHistory(sanitizeEpsHistory(parsed.epsHistory ?? []));
      setEpsPeMultiple(typeof parsed.epsPeMultiple === 'string' ? parsed.epsPeMultiple : '');
    };

    const restoreFromLocal = () => {
      try {
        const rawDraft = localStorage.getItem(draftKey);
        if (!rawDraft) return;

        const parsed = JSON.parse(rawDraft) as Draft;
        applyDraft(parsed);
      } catch (error) {
        console.error('Failed to restore local analysis draft', error);
      }
    };

    const signedInUserId = typeof user?.id === 'string' ? user.id : '';

    const restoreFromAccountBackup = () => {
      if (!signedInUserId) return false;
      const backup = loadAccountDraftBackup(signedInUserId, analysisSymbol);
      if (!backup) return false;

      applyDraft(backup.draft);
      if (backup.companyName.trim()) {
        setCompanyName(backup.companyName.trim());
      }
      setSaveStatus('Recovered From Account Backup');
      setTimeout(() => setSaveStatus(defaultSaveLabel), 2000);
      return true;
    };

    const restoreDraft = async () => {
      if (!isSignedIn) {
        setStorageMode('local');
        restoreFromLocal();
        setIsDraftHydrated(true);
        return;
      }

      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(analysisSymbol)}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          setStorageMode('local');
          if (restoreFromAccountBackup()) {
            return;
          }
          restoreFromLocal();
          return;
        }

        const data = await response.json();
        setStorageMode(data?.storage === 'database' ? 'database' : 'local');
        const filing = data?.filing as { companyName?: string; draft?: unknown } | null;

        if (!filing) {
          if (restoreFromAccountBackup()) {
            return;
          }
          restoreFromLocal();
          return;
        }

        const resolvedCompanyName = typeof filing.companyName === 'string' && filing.companyName.trim()
          ? filing.companyName.trim()
          : analysisSymbol;

        if (typeof filing.companyName === 'string' && filing.companyName.trim()) {
          setCompanyName(filing.companyName.trim());
        }

        if (filing.draft && typeof filing.draft === 'object') {
          const parsedDraft = filing.draft as Draft;
          applyDraft(parsedDraft);
          if (signedInUserId) {
            saveAccountDraftBackup(signedInUserId, analysisSymbol, parsedDraft, resolvedCompanyName);
          }
          return;
        }

        if (restoreFromAccountBackup()) {
          return;
        }

        restoreFromLocal();
      } catch (error) {
        console.error('Failed to restore account analysis draft', error);
        setStorageMode('local');
        if (restoreFromAccountBackup()) {
          return;
        }
        restoreFromLocal();
      } finally {
        setIsDraftHydrated(true);
      }
    };

    restoreDraft();
  }, [analysisSymbol, draftKey, isSignedIn, isUserLoaded, user?.id, isViewMode]);

  useEffect(() => {
    if (!analysisSymbol || !isDraftHydrated || isViewMode) return;

    const draft = createDraftPayload();

    localStorage.setItem(draftKey, JSON.stringify(draft));

    if (isSignedIn && user?.id) {
      saveAccountDraftBackup(user.id, analysisSymbol, draft, companyName || analysisSymbol);
    }
  }, [analysisSymbol, draftKey, isDraftHydrated, isViewMode, scenarioAnalyses, casesSummary, publicReviewOptIn, activeScenario, fcf, shares, cash, debt, discountRate, terminalGrowth, years, savedDcfPrice, savedDcfAt, publishedFile, isSignedIn, user?.id, companyName, segments, epsHistory, epsPeMultiple]);

  const loadStockData = async (targetSymbol: string) => {
    if (!targetSymbol) {
      setLoadError('Invalid stock symbol.');
      return;
    }

    setLoadError('');
    setIsLoadingData(true);

    try {
      const priceRes = await fetch(`/api/price/${encodeURIComponent(targetSymbol)}?includeFundamentals=1`);

      const priceData = (await priceRes.json()) as PriceResponse;
      if (!priceRes.ok) {
        throw new Error('Failed to fetch current price.');
      }

      setCurrentPrice(Number(priceData.currentPrice || 0));
      setCompanyName(priceData.companyName || targetSymbol);
      setCompanyLogo(typeof priceData.logo === 'string' ? priceData.logo : '');
      if (priceData.fundamentals && typeof priceData.fundamentals === 'object') {
        setFundamentals(priceData.fundamentals);
      } else {
        setFundamentals(null);
      }
    } catch (error) {
      console.error('Failed to load stock analysis data', error);
      setLoadError('Failed to load stock data. Please try again.');
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (!analysisSymbol) return;
    loadStockData(analysisSymbol);
  }, [analysisSymbol]);

  function calculateDcfForGrowthRate(growthRate: string): number | null {
    const parsedFcf = parseNumericInput(fcf);
    const parsedShares = parseNumericInput(shares);
    const parsedCash = cash.trim() ? parseNumericInput(cash) : 0;
    const parsedDebt = debt.trim() ? parseNumericInput(debt) : 0;
    const parsedGrowth = parseNumericInput(growthRate);
    const parsedDiscount = parseNumericInput(discountRate);
    const parsedTerminal = parseNumericInput(terminalGrowth);
    const parsedYears = parseNumericInput(years);

    if (!fcf.trim() || !shares.trim()) return null;
    if ([parsedFcf, parsedShares, parsedCash, parsedDebt, parsedGrowth, parsedDiscount, parsedTerminal, parsedYears].some((value) => Number.isNaN(value))) {
      return null;
    }
    if (!(parsedFcf > 0) || !(parsedShares > 0)) return null;

    try {
      const result = calculateDCF({
        fcf: parsedFcf,
        growthRate: parsedGrowth,
        discountRate: parsedDiscount,
        terminalGrowth: parsedTerminal,
        years: parsedYears,
        sharesOutstanding: parsedShares,
        cashEquivalent: parsedCash,
        totalDebt: parsedDebt,
      });
      return result.intrinsicValuePerShare;
    } catch {
      return null;
    }
  }

  const dcfValue = useMemo(() => {
    return calculateDcfForGrowthRate(activeScenarioData.growthRate);
  }, [fcf, shares, cash, debt, activeScenarioData.growthRate, discountRate, terminalGrowth, years]);

  const baseScenarioDcfValue = useMemo(() => {
    return calculateDcfForGrowthRate(scenarioAnalyses.base.growthRate);
  }, [fcf, shares, cash, debt, scenarioAnalyses.base.growthRate, discountRate, terminalGrowth, years]);

  const valuationGap = useMemo(() => {
    if (dcfValue === null || currentPrice === null || currentPrice <= 0) return null;

    const difference = dcfValue - currentPrice;
    const differencePct = (difference / currentPrice) * 100;

    return {
      difference,
      differencePct,
      direction: difference >= 0 ? 'above' : 'below',
    };
  }, [dcfValue, currentPrice]);

  const baseScenarioValuationGap = useMemo(() => {
    if (baseScenarioDcfValue === null || currentPrice === null || currentPrice <= 0) return null;

    const difference = baseScenarioDcfValue - currentPrice;
    const differencePct = (difference / currentPrice) * 100;

    return {
      difference,
      differencePct,
      direction: difference >= 0 ? 'above' : 'below',
    };
  }, [baseScenarioDcfValue, currentPrice]);

  const fundamentalHighlights = useMemo(() => ([
    { label: 'Current P/E', value: formatMetricValue(fundamentals?.currentPe, 2) },
    { label: 'Dividend Yield (% Price)', value: formatMetricPercent(fundamentals?.dividendYield, 1, 1) },
  ]), [fundamentals]);

  const hasAnyFundamentalData = useMemo(
    () => fundamentalHighlights.some((item) => item.value !== '—'),
    [fundamentalHighlights],
  );

  const calculateScenarioDcf = (growthRate: string): number | null => {
    return calculateDcfForGrowthRate(growthRate);
  };

  const updateScenario = (scenario: ScenarioKey, updates: Partial<ScenarioAnalysis>) => {
    setScenarioAnalyses((prev) => ({
      ...prev,
      [scenario]: {
        ...prev[scenario],
        ...updates,
      },
    }));
  };

  const applyScenarioGrowthFromBase = (baseGrowthRate: number) => {
    const conservativeGrowth = baseGrowthRate * (1 - PROJECTED_GROWTH_SPREAD);
    const aggressiveGrowth = baseGrowthRate * (1 + PROJECTED_GROWTH_SPREAD);

    setScenarioAnalyses((prev) => ({
      conservative: {
        ...prev.conservative,
        growthRate: formatRate(conservativeGrowth),
      },
      base: {
        ...prev.base,
        growthRate: formatRate(baseGrowthRate),
      },
      aggressive: {
        ...prev.aggressive,
        growthRate: formatRate(aggressiveGrowth),
      },
    }));
  };

  const handleDiscountRateChange = (value: string) => {
    setDiscountRate(value);

    const trimmed = value.trim();
    if (!trimmed) return;

    const parsedDiscount = parseNumericInput(trimmed);
    if (Number.isNaN(parsedDiscount)) return;

    applyScenarioGrowthFromBase(parsedDiscount);
  };

  const handleProjectedGrowthRateChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const parsedBaseGrowth = parseNumericInput(trimmed);
    if (Number.isNaN(parsedBaseGrowth)) return;

    applyScenarioGrowthFromBase(parsedBaseGrowth);
  };

  const saveDraftToAccount = async (draft: Draft) => {
    if (!isSignedIn) return false;

    try {
      const response = await fetch(`/api/analysis/${encodeURIComponent(analysisSymbol)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName || analysisSymbol,
          draft,
        }),
      });

      if (response.ok) {
        setStorageMode('database');
      } else {
        setStorageMode('local');
      }

      return response.ok;
    } catch (error) {
      console.error('Failed to save analysis draft to account', error);
      setStorageMode('local');
      return false;
    }
  };

  const saveFile = async () => {
    if (!analysisSymbol || isViewMode) return;

    setSaveStatus('Saving...');

    const publishedAt = new Date().toISOString();
    const nextPublishedFile: PublishedAnalysisFile = {
      symbol: analysisSymbol,
      companyName: companyName || analysisSymbol,
      publishedAt,
      scenarioAnalyses,
      casesSummary,
      activeScenario,
      savedDcfPrice,
      savedDcfAt,
      segments,
      epsHistory,
      epsPeMultiple,
    };

    setPublishedFile(nextPublishedFile);

    const draft = createDraftPayload({
      publishedOverride: nextPublishedFile,
    });

    localStorage.setItem(draftKey, JSON.stringify(draft));
    updateLocalFilingsRecord(analysisSymbol, companyName || analysisSymbol, publishedAt);
    if (isSignedIn && user?.id) {
      saveAccountDraftBackup(user.id, analysisSymbol, draft, companyName || analysisSymbol);
    }

    let accountSaved = false;
    if (isSignedIn) {
      accountSaved = await saveDraftToAccount(draft);
    }

    setSaveStatus(
      isSignedIn
        ? accountSaved
          ? 'Saved'
          : 'Saved Local Only (Account Sync Unavailable)'
        : 'Saved To Browser',
    );
    setTimeout(() => setSaveStatus(defaultSaveLabel), 1500);
  };

  const saveDcfPriceToFile = () => {
    if (dcfValue === null) {
      setSaveDcfStatus('Enter valid DCF inputs');
      setTimeout(() => setSaveDcfStatus('Save DCF Price'), 1400);
      return;
    }

    const now = new Date().toISOString();
    setSavedDcfPrice(dcfValue);
    setSavedDcfAt(now);
    setShowDcfInputs(false);
    setSaveDcfStatus('DCF Saved');
    setTimeout(() => setSaveDcfStatus('Save DCF Price'), 1400);
  };

  const toggleDcfInputs = () => {
    setShowDcfInputs((prev) => !prev);
  };

  if (!analysisSymbol) {
    return (
      <div className="min-h-screen bg-market-mesh py-12 px-4 font-sans text-slate-100">
        <div className="max-w-[900px] mx-auto bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
          <h1 className="text-2xl font-black tracking-tight">Invalid Analysis File</h1>
          <p className="text-sm text-blue-100/90 mt-3">The selected stock symbol is missing or invalid.</p>
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

  if (isViewMode && publishedFile) {
    const viewScenario = publishedFile.scenarioAnalyses[activeScenario];
    const viewDcf = calculateScenarioDcf(viewScenario?.growthRate || '');

    return (
      <div className="min-h-screen bg-market-mesh py-8 px-4 font-sans text-slate-100">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200/85">Published Analysis Report</p>
            <div className="flex items-center gap-2">
              <Link
                href={`/analysis/${encodeURIComponent(analysisSymbol)}`}
                className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
              >
                Edit File
              </Link>
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
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight text-blue-50">{publishedFile.symbol}</h1>
                  <p className="mt-2 text-lg text-blue-100/90">{publishedFile.companyName || analysisSymbol}</p>
                  <div className="mt-3 text-[13px] text-blue-100/80 space-y-0.5">
                    <p><span className="font-semibold text-blue-200">Published:</span> {formatDateTime(publishedFile.publishedAt)}</p>
                    <p><span className="font-semibold text-blue-200">Saved DCF:</span> {publishedFile.savedDcfPrice !== null ? `$${formatCurrency(publishedFile.savedDcfPrice)}` : '—'}</p>
                  </div>
                </div>

                {/* Scenario toggle */}
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
                  Growth: <span className="font-semibold text-blue-100">{formatGrowthRatePercent(viewScenario?.growthRate || '')}</span>
                </span>
                {viewDcf !== null && (
                  <span className="text-blue-200/70">
                    DCF / Share: <span className="font-semibold text-blue-100">${formatCurrency(viewDcf)}</span>
                  </span>
                )}
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-2">Company Fundamentals</p>
                <ul className="list-none pl-0 space-y-0.5">
                  {fundamentalHighlights.map((item) => (
                    <li key={`published-${item.label}`} className="text-[13px] text-blue-100/80">
                      <span className="font-semibold text-blue-200">{item.label}:</span> {item.value}
                    </li>
                  ))}
                </ul>
                {!hasAnyFundamentalData && (
                  <p className="mt-2 text-[11px] text-blue-100/70">Fundamentals are unavailable for this symbol right now.</p>
                )}
              </div>
            </header>

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

            {publishedFile.segments && publishedFile.segments.length > 0 && (
              <section className="mb-10">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-6">Business Segments</h2>
                <SegmentCharts segments={publishedFile.segments} activeScenario={activeScenario} />
              </section>
            )}

            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/85 mb-4">
                {scenarioOptions.find((o) => o.key === activeScenario)?.label} Analysis
              </h2>
              <p className="whitespace-pre-wrap leading-7 text-[15px] text-blue-50/95">
                {viewScenario?.analysis?.trim() || 'No analysis has been written for this scenario yet.'}
              </p>
            </section>
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-market-mesh py-12 px-4 font-sans text-slate-100">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Analysis File: {analysisSymbol}</h1>
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-[0.18em] mt-2">
              {isViewMode ? 'Published File View' : 'Scenario Growth Analysis'}
            </p>
            {publishedFile?.publishedAt && (
              <p className="text-[11px] font-semibold text-emerald-200/90 mt-2">
                Published {formatDateTime(publishedFile.publishedAt)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isViewMode ? (
              <Link
                href={`/analysis/${encodeURIComponent(analysisSymbol)}`}
                className="px-4 py-2.5 bg-amber-500/15 border border-amber-300/35 rounded-xl text-[12px] font-semibold text-amber-100 hover:bg-amber-500/25 transition-all"
              >
                Edit File
              </Link>
            ) : (
              <>
                <button
                  onClick={() => {
                    void saveFile();
                  }}
                  className="px-4 py-2.5 bg-emerald-500/15 border border-emerald-300/35 rounded-xl text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/25 transition-all"
                >
                  {saveStatus}
                </button>
                <Link
                  href={`/analysis/${encodeURIComponent(analysisSymbol)}?view=1`}
                  className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
                >
                  View Report
                </Link>
              </>
            )}
            <Link
              href="/analysis"
              className="px-5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all shadow-sm active:scale-95"
            >
              Back to Filings
            </Link>
          </div>
        </div>

        {isSignedIn && storageMode === 'local' && (
          <div className="mb-5 rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-100">
            Account sync is unavailable on this deployment right now. This analysis is saving to this browser only.
          </div>
        )}

        {isViewMode && !publishedFile && (
          <div className="mb-5 rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-100">
            No published clean file exists yet for this stock. Open Edit File, then save when ready.
          </div>
        )}

        <div className="mb-6 bg-white/5 rounded-2xl shadow-sm border border-white/10 p-4 backdrop-blur-md">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-3 xl:col-span-2">
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={`${companyName || analysisSymbol} logo`}
                  className="h-10 w-10 rounded-lg object-cover bg-white/10 border border-white/10"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-blue-200">
                  {analysisSymbol.slice(0, 3)}
                </div>
              )}

              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-1">Company</p>
                <p className="text-sm font-semibold text-blue-50 truncate">{companyName || analysisSymbol}</p>
              </div>
            </div>

            <MetricCard
              label="Current Price"
              value={currentPrice !== null ? `$${formatCurrency(currentPrice)}` : '—'}
              actionLabel="Refresh market price"
              onAction={() => loadStockData(analysisSymbol)}
              isActionLoading={isLoadingData}
            />
            <MetricCard
              label="DCF Value / Share [Base Case]"
              value={baseScenarioDcfValue !== null ? `$${formatCurrency(baseScenarioDcfValue)}` : '—'}
              badgeText={baseScenarioValuationGap ? formatPercent(baseScenarioValuationGap.differencePct) : undefined}
              badgeClassName={baseScenarioValuationGap ? (baseScenarioValuationGap.differencePct >= 0 ? 'text-emerald-300' : 'text-rose-300') : undefined}
              actionLabel={isViewMode ? undefined : showDcfInputs ? 'Hide DCF inputs' : 'Show DCF inputs'}
              onAction={isViewMode ? undefined : toggleDcfInputs}
            />
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em]">Company Fundamentals</p>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-2 gap-2.5">
              {fundamentalHighlights.map((item) => (
                <FundamentalPill key={`draft-${item.label}`} label={item.label} value={item.value} />
              ))}
            </div>
            {!hasAnyFundamentalData && (
              <p className="mt-2 text-[11px] text-blue-100/70">
                Fundamentals are unavailable for this symbol right now.
              </p>
            )}
          </div>

          {savedDcfAt && (
            <div className="mt-3 text-[11px] text-blue-100/85">
              <p>Saved DCF at {formatDateTime(savedDcfAt)}</p>
            </div>
          )}
        </div>

        {loadError && (
          <div className="mb-6 px-4 py-3 bg-rose-500/10 border border-rose-400/30 rounded-xl text-rose-300 text-sm font-semibold">
            {loadError}
          </div>
        )}

        {showDcfInputs && !isViewMode && (
          <div className="mb-6 bg-white/5 rounded-2xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
            <p className="text-xs text-blue-100/80 mb-2">Enter your own assumptions and financial inputs, then save a DCF price to this analysis file.</p>
            <p className="text-xs text-blue-200/85 mb-3">
              Using {activeScenarioLabel} growth rate: {activeScenarioData.growthRate || '—'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <Field label="Free Cash Flow (FCF)" value={fcf} onChange={setFcf} />
              <Field label="Shares Outstanding" value={shares} onChange={setShares} />
              <Field label="Cash Equivalent" value={cash} onChange={setCash} />
              <Field label="Total Debt" value={debt} onChange={setDebt} />
              <Field label="Projected Growth Rate (Base)" value={scenarioAnalyses.base.growthRate} onChange={handleProjectedGrowthRateChange} />
              <Field label="Discount Rate" value={discountRate} onChange={handleDiscountRateChange} />
              <Field label="Terminal Growth" value={terminalGrowth} onChange={setTerminalGrowth} />
              <Field label="Years" value={years} onChange={setYears} />
            </div>

            <button
              onClick={saveDcfPriceToFile}
              className="mt-4 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={dcfValue === null}
            >
              {saveDcfStatus}
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 shadow-sm backdrop-blur-md overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-white/10 bg-gradient-to-r from-slate-900/80 via-slate-900/75 to-blue-900/30">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 p-1.5 shadow-sm">
                {scenarioOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setActiveScenario(option.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-semibold border shadow-sm transition-all ${
                      option.key === 'conservative'
                        ? activeScenario === option.key
                          ? 'bg-rose-500/20 text-rose-100 border-rose-300/40 ring-1 ring-rose-300/25'
                          : 'bg-rose-500/5 text-rose-200/85 border-rose-300/20 hover:bg-rose-500/10 hover:text-rose-100'
                        : option.key === 'base'
                          ? activeScenario === option.key
                            ? 'bg-amber-500/20 text-amber-100 border-amber-300/40 ring-1 ring-amber-300/25'
                            : 'bg-amber-500/5 text-amber-100/85 border-amber-300/20 hover:bg-amber-500/10 hover:text-amber-100'
                          : activeScenario === option.key
                            ? 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40 ring-1 ring-emerald-300/25'
                            : 'bg-emerald-500/5 text-emerald-100/85 border-emerald-300/20 hover:bg-emerald-500/10 hover:text-emerald-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div
                className={`rounded-xl border px-3 py-2 bg-slate-900/55 ${
                  activeScenario === 'conservative'
                    ? 'border-rose-300/30'
                    : activeScenario === 'base'
                      ? 'border-amber-300/30'
                      : 'border-emerald-300/30'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-end">
                  <div>
                    <label
                      className={`block text-[10px] font-semibold uppercase tracking-[0.1em] mb-1 ${
                        activeScenario === 'conservative'
                          ? 'text-rose-200'
                          : activeScenario === 'base'
                            ? 'text-amber-200'
                            : 'text-emerald-200'
                      }`}
                    >
                      Projected Growth
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={activeScenarioData.growthRate}
                      onChange={(event) => updateScenario(activeScenario, { growthRate: event.target.value })}
                      disabled={isViewMode}
                      className={`w-full px-3 py-2 bg-slate-800/80 text-slate-100 border rounded-lg font-semibold focus:outline-none focus:bg-slate-800 transition-all text-xs ${
                        activeScenario === 'conservative'
                          ? 'border-rose-300/25 focus:border-rose-300'
                          : activeScenario === 'base'
                            ? 'border-amber-300/25 focus:border-amber-300'
                            : 'border-emerald-300/25 focus:border-emerald-300'
                      }`}
                    />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-1">Projected DCF / Share</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-blue-50">
                        {dcfValue !== null ? `$${formatCurrency(dcfValue)}` : '—'}
                      </p>
                      {valuationGap && (
                        <span className={`text-[11px] font-semibold ${valuationGap.differencePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {formatPercent(valuationGap.differencePct)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em]">EPS History</p>
                {!isViewMode && (
                  <button
                    onClick={() => setEpsHistory((prev) => [...prev, { year: '', eps: '' }])}
                    className="px-3 py-1 bg-blue-600/20 border border-blue-400/30 rounded-lg text-[10px] font-semibold text-blue-200 hover:bg-blue-600/30 transition-all"
                  >
                    + Add Year
                  </button>
                )}
              </div>

              {!isViewMode && epsHistory.length === 0 && (
                <p className="text-[11px] text-blue-100/40 mb-3">Add up to 5 years of historical EPS to generate historical + projected charts.</p>
              )}

              {epsHistory.length > 0 && !isViewMode && (
                <div className="space-y-2 mb-3">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-200/60">Year</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-200/60">EPS ($)</p>
                    <span />
                  </div>
                  {epsHistory.map((pt, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <input
                        type="text"
                        placeholder="e.g. 2023"
                        value={pt.year}
                        onChange={(e) => setEpsHistory((prev) => prev.map((p, i) => i === idx ? { ...p, year: e.target.value } : p))}
                        className="px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-lg text-xs font-medium focus:outline-none"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 11.45"
                        value={pt.eps}
                        onChange={(e) => setEpsHistory((prev) => prev.map((p, i) => i === idx ? { ...p, eps: e.target.value } : p))}
                        className="px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-lg text-xs font-medium focus:outline-none"
                      />
                      <button
                        onClick={() => setEpsHistory((prev) => prev.filter((_, i) => i !== idx))}
                        className="px-2 py-1.5 bg-rose-500/10 border border-rose-400/25 rounded-lg text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
                        aria-label="Remove year"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!isViewMode && epsHistory.some((p) => p.year.trim() && p.eps.trim()) && (
                <div className="mb-3">
                  <label className="block text-[10px] font-semibold text-blue-200/60 uppercase tracking-[0.1em] mb-1">Forward PE Multiple</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 30"
                    value={epsPeMultiple}
                    onChange={(e) => setEpsPeMultiple(e.target.value)}
                    className="w-32 px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-lg text-xs font-medium focus:outline-none"
                  />
                </div>
              )}

              {epsHistory.some((p) => p.year.trim() && p.eps.trim()) && (
                <EpsChart
                  history={epsHistory}
                  scenarioAnalyses={scenarioAnalyses}
                  peMultiple={epsPeMultiple}
                  activeScenario={activeScenario}
                />
              )}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em]">Business Segments</p>
                {!isViewMode && (
                  <button
                    onClick={() => setSegments((prev) => [...prev, { name: '', revenue: '', operatingIncome: '', growth: '' }])}
                    className="px-3 py-1 bg-blue-600/20 border border-blue-400/30 rounded-lg text-[10px] font-semibold text-blue-200 hover:bg-blue-600/30 transition-all"
                  >
                    + Add Segment
                  </button>
                )}
              </div>

              {!isViewMode && segments.length === 0 && (
                <p className="text-[11px] text-blue-100/40 mb-3">Add segments to show revenue &amp; operating income breakdowns with projected growth toggles.</p>
              )}

              {segments.length > 0 && !isViewMode && (
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 px-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-200/60">Segment</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-200/60">Revenue ($M)</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-200/60">Op. Income ($M)</p>
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${
                      activeScenario === 'conservative' ? 'text-rose-300/80' : activeScenario === 'base' ? 'text-amber-300/80' : 'text-emerald-300/80'
                    }`}>
                      Growth % /yr
                    </p>
                    <span />
                  </div>
                  {segments.map((seg, idx) => {
                    const growthValue = activeScenario === 'conservative'
                      ? (seg.growthBear ?? '')
                      : activeScenario === 'aggressive'
                        ? (seg.growthBull ?? '')
                        : seg.growth;
                    const setGrowth = (val: string) => setSegments((prev) => prev.map((s, i) => {
                      if (i !== idx) return s;
                      if (activeScenario === 'conservative') return { ...s, growthBear: val };
                      if (activeScenario === 'aggressive') return { ...s, growthBull: val };
                      return { ...s, growth: val };
                    }));
                    return (
                      <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                        <input
                          type="text"
                          placeholder="e.g. Intelligent Cloud"
                          value={seg.name}
                          onChange={(e) => setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                          className="px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-lg text-xs font-medium focus:outline-none"
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 106265"
                          value={seg.revenue}
                          onChange={(e) => setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, revenue: e.target.value } : s))}
                          className="px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-lg text-xs font-medium focus:outline-none"
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 44589"
                          value={seg.operatingIncome}
                          onChange={(e) => setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, operatingIncome: e.target.value } : s))}
                          className="px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-lg text-xs font-medium focus:outline-none"
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 15"
                          value={growthValue}
                          onChange={(e) => setGrowth(e.target.value)}
                          className={`px-2.5 py-1.5 bg-slate-800/80 text-slate-100 border rounded-lg text-xs font-medium focus:outline-none ${
                            activeScenario === 'conservative'
                              ? 'border-rose-300/20 focus:border-rose-300'
                              : activeScenario === 'base'
                                ? 'border-amber-300/20 focus:border-amber-300'
                                : 'border-emerald-300/20 focus:border-emerald-300'
                          }`}
                        />
                        <button
                          onClick={() => setSegments((prev) => prev.filter((_, i) => i !== idx))}
                          className="px-2 py-1.5 bg-rose-500/10 border border-rose-400/25 rounded-lg text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
                          aria-label="Remove segment"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {segments.length > 0 && (
                <SegmentCharts segments={segments} activeScenario={activeScenario} />
              )}
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <label className={`block text-[11px] font-semibold uppercase tracking-[0.1em] mb-2 ${
                activeScenario === 'conservative' ? 'text-rose-300' : activeScenario === 'base' ? 'text-amber-300' : 'text-emerald-300'
              }`}>
                {activeScenarioLabel} Analysis
              </label>
              <textarea
                value={activeScenarioData.analysis}
                onChange={(event) => updateScenario(activeScenario, { analysis: event.target.value })}
                placeholder={`Write your ${activeScenarioLabel.toLowerCase()} thesis here…`}
                readOnly={isViewMode}
                className={`w-full min-h-[260px] px-4 py-3 bg-slate-800/70 text-slate-100 border rounded-xl text-sm font-medium focus:outline-none transition-all ${
                  isViewMode
                    ? 'cursor-default border-white/10'
                    : activeScenario === 'conservative'
                      ? 'border-rose-300/20 focus:border-rose-300/60'
                      : activeScenario === 'base'
                        ? 'border-amber-300/20 focus:border-amber-300/60'
                        : 'border-emerald-300/20 focus:border-emerald-300/60'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">
        {label}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-4 py-2.5 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClassName,
  actionLabel,
  onAction,
  isActionLoading,
  badgeText,
  badgeClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  actionLabel?: string;
  onAction?: () => void;
  isActionLoading?: boolean;
  badgeText?: string;
  badgeClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em]">{label}</p>
        {onAction && (
          <button
            onClick={onAction}
            title={actionLabel || 'Refresh'}
            aria-label={actionLabel || 'Refresh'}
            className="h-4 min-w-4 px-[3px] rounded-md border border-white/20 bg-white/10 text-[9px] leading-none font-semibold text-blue-100 hover:bg-white/15 transition-all"
          >
            {isActionLoading ? '…' : '↻'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-semibold ${valueClassName || 'text-blue-50'}`}>{value}</p>
        {badgeText && (
          <span className={`text-xs font-semibold ${badgeClassName || 'text-blue-100'}`}>{badgeText}</span>
        )}
      </div>
    </div>
  );
}

function FundamentalPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/45 px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-blue-200/85">{label}</p>
      <p className="mt-1 text-[12px] font-semibold text-blue-50">{value}</p>
    </div>
  );
}

const SEGMENT_PALETTE = ['#60A5FA', '#A78BFA', '#34D399', '#F59E0B', '#F472B6', '#38BDF8', '#F87171'];

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

function EpsChart({
  history,
  scenarioAnalyses,
  peMultiple,
  activeScenario,
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
    conservative: '#F87171',
    base: '#60A5FA',
    aggressive: '#34D399',
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

  const W = 480;
  const H = 180;
  const PAD = { top: 14, right: 16, bottom: 28, left: 46 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const valRange = maxVal - minVal || 1;
  const yearRange = maxYear - minYear || 1;

  const toX = (year: number) => PAD.left + ((year - minYear) / yearRange) * chartW;
  const toY = (val: number) => PAD.top + chartH - ((val - minVal) / valRange) * chartH;

  const polyline = (pts: { year: number; value: number }[]) =>
    pts.map((p) => `${toX(p.year)},${toY(p.value)}`).join(' ');

  const color = scenarioColors[activeScenario];

  const yTicks = 4;
  const xTicks = Array.from(new Set(allYears)).filter((y) => Number.isInteger(y));

  return (
    <div>
      <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
        {hasPe && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode('eps')}
              className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                mode === 'eps'
                  ? 'bg-blue-600/25 border-blue-400/40 text-blue-100'
                  : 'bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10 hover:text-blue-200'
              }`}
            >
              EPS
            </button>
            <button
              onClick={() => setMode('price')}
              className={`px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                mode === 'price'
                  ? 'bg-blue-600/25 border-blue-400/40 text-blue-100'
                  : 'bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10 hover:text-blue-200'
              }`}
            >
              EPS × PE = Price
            </button>
          </div>
        )}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* Y axis ticks */}
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

        {/* X axis ticks */}
        {xTicks.map((yr) => (
          <text key={yr} x={toX(yr)} y={PAD.top + chartH + 16} textAnchor="middle" fill="#94A3B8" fontSize="9">
            {yr}
          </text>
        ))}

        {/* Historical line */}
        {histPoints.length > 1 && (
          <polyline points={polyline(histPoints)} fill="none" stroke="#E2E8F0" strokeWidth="2" strokeLinejoin="round" />
        )}

        {/* Historical dots */}
        {histPoints.map((p) => (
          <circle key={p.year} cx={toX(p.year)} cy={toY(p.value)} r={3.5} fill="#E2E8F0" />
        ))}

        {/* Projection line (dashed) */}
        {projPoints.length > 1 && (
          <polyline
            points={polyline(projPoints)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="5 3"
            strokeLinejoin="round"
          />
        )}

        {/* Projection dots */}
        {projPoints.slice(1).map((p) => (
          <circle key={p.year} cx={toX(p.year)} cy={toY(p.value)} r={3} fill={color} />
        ))}

        {/* Divider at last historical year */}
        {histPoints.length > 0 && projPoints.length > 0 && (
          <line
            x1={toX(lastHistYear)}
            y1={PAD.top}
            x2={toX(lastHistYear)}
            y2={PAD.top + chartH}
            stroke="#FFFFFF20"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <div className="mt-2 flex items-center gap-4 text-[10px] text-blue-100/50">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 bg-slate-200 rounded" />
          Historical
        </span>
        <span className="flex items-center gap-1.5" style={{ color }}>
          <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: color, borderTop: `2px dashed ${color}`, background: 'none' }} />
          {activeScenario.charAt(0).toUpperCase() + activeScenario.slice(1)} Projected
        </span>
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
