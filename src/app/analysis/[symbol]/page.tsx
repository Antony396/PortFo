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
};

type ScenarioKey = 'conservative' | 'base' | 'aggressive';

type ScenarioAnalysis = {
  growthRate: string;
  analysis: string;
  likelihood: string;
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
  conservative: { growthRate: '0.04', analysis: '', likelihood: '30' },
  base: { growthRate: '0.08', analysis: '', likelihood: '40' },
  aggressive: { growthRate: '0.12', analysis: '', likelihood: '30' },
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

function sanitizeScenarioAnalysis(value: unknown, fallback: ScenarioAnalysis): ScenarioAnalysis {
  if (!value || typeof value !== 'object') return fallback;

  const raw = value as Partial<ScenarioAnalysis>;
  const growthRate = typeof raw.growthRate === 'string' ? raw.growthRate : fallback.growthRate;
  const analysis = typeof raw.analysis === 'string' ? raw.analysis : fallback.analysis;
  const likelihood = typeof raw.likelihood === 'string' ? raw.likelihood : fallback.likelihood;

  return { growthRate, analysis, likelihood };
}

function isScenarioKey(value: string): value is ScenarioKey {
  return value === 'conservative' || value === 'base' || value === 'aggressive';
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
      publicReviewOptInOverride?: boolean;
    },
  ): Draft => ({
    scenarioAnalyses,
    casesSummary,
    publicReviewOptIn: params?.publicReviewOptInOverride ?? publicReviewOptIn,
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
            likelihood: defaultScenarioAnalyses.base.likelihood,
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
  }, [analysisSymbol, draftKey, isDraftHydrated, isViewMode, scenarioAnalyses, casesSummary, publicReviewOptIn, activeScenario, fcf, shares, cash, debt, discountRate, terminalGrowth, years, savedDcfPrice, savedDcfAt, publishedFile, isSignedIn, user?.id, companyName]);

  const loadStockData = async (targetSymbol: string) => {
    if (!targetSymbol) {
      setLoadError('Invalid stock symbol.');
      return;
    }

    setLoadError('');
    setIsLoadingData(true);

    try {
      const priceRes = await fetch(`/api/price/${encodeURIComponent(targetSymbol)}`);

      const priceData = (await priceRes.json()) as PriceResponse;
      if (!priceRes.ok) {
        throw new Error('Failed to fetch current price.');
      }

      setCurrentPrice(Number(priceData.currentPrice || 0));
      setCompanyName(priceData.companyName || targetSymbol);
      setCompanyLogo(typeof priceData.logo === 'string' ? priceData.logo : '');
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

  const dcfValue = useMemo(() => {
    const parsedFcf = parseNumericInput(fcf);
    const parsedShares = parseNumericInput(shares);
    const parsedCash = cash.trim() ? parseNumericInput(cash) : 0;
    const parsedDebt = debt.trim() ? parseNumericInput(debt) : 0;
    const parsedGrowth = parseNumericInput(activeScenarioData.growthRate);
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
  }, [fcf, shares, cash, debt, activeScenarioData.growthRate, discountRate, terminalGrowth, years]);

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

  const calculateScenarioDcf = (growthRate: string): number | null => {
    const parsedFcf = parseNumericInput(fcf);
    const parsedShares = parseNumericInput(shares);
    const parsedCash = cash.trim() ? parseNumericInput(cash) : 0;
    const parsedDebt = debt.trim() ? parseNumericInput(debt) : 0;
    const parsedGrowth = parseNumericInput(growthRate);
    const parsedDiscount = parseNumericInput(discountRate);
    const parsedTerminal = parseNumericInput(terminalGrowth);
    const parsedYears = parseNumericInput(years);

    if ([parsedFcf, parsedShares, parsedCash, parsedDebt, parsedGrowth, parsedDiscount, parsedTerminal, parsedYears].some((value) => Number.isNaN(value))) {
      return null;
    }
    if (!(parsedFcf > 0) || !(parsedShares > 0)) return null;

    try {
      return calculateDCF({
        fcf: parsedFcf,
        growthRate: parsedGrowth,
        discountRate: parsedDiscount,
        terminalGrowth: parsedTerminal,
        years: parsedYears,
        sharesOutstanding: parsedShares,
        cashEquivalent: parsedCash,
        totalDebt: parsedDebt,
      }).intrinsicValuePerShare;
    } catch {
      return null;
    }
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

  const saveFile = async (options?: { publicReviewOptInOverride?: boolean }) => {
    if (!analysisSymbol || isViewMode) return;

    setSaveStatus('Saving...');

    const effectivePublicReviewOptIn = options?.publicReviewOptInOverride ?? publicReviewOptIn;

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
    };

    setPublishedFile(nextPublishedFile);

    const draft = createDraftPayload({
      publishedOverride: nextPublishedFile,
      publicReviewOptInOverride: effectivePublicReviewOptIn,
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

  const togglePublicReviewOptIn = () => {
    const nextValue = !publicReviewOptIn;
    setPublicReviewOptIn(nextValue);
    void saveFile({ publicReviewOptInOverride: nextValue });
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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-12 px-4 font-sans text-slate-100">
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
    const orderedScenarioOptions = [...scenarioOptions].sort((a, b) => {
      const likelihoodA = parseLikelihoodPercent(publishedFile.scenarioAnalyses[a.key]?.likelihood || '0');
      const likelihoodB = parseLikelihoodPercent(publishedFile.scenarioAnalyses[b.key]?.likelihood || '0');

      if (likelihoodA === likelihoodB) {
        return scenarioOptions.findIndex((option) => option.key === a.key)
          - scenarioOptions.findIndex((option) => option.key === b.key);
      }

      return likelihoodB - likelihoodA;
    });

    const mostLikelyScenario = orderedScenarioOptions[0];
    const dcfYears = parseNumericInput(years);
    const dcfHorizonLabel = Number.isFinite(dcfYears) && dcfYears > 0
      ? `${Number.isInteger(dcfYears) ? dcfYears.toFixed(0) : dcfYears.toFixed(1)} year${dcfYears === 1 ? '' : 's'}`
      : 'the configured DCF horizon';

    const scenarioTopMetrics = orderedScenarioOptions.map((option) => {
      const scenario = publishedFile.scenarioAnalyses[option.key];
      return {
        option,
        scenario,
        dcfValue: calculateScenarioDcf(scenario?.growthRate || ''),
      };
    });

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-8 px-4 font-sans text-slate-100">
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
              <h1 className="text-4xl font-bold tracking-tight text-blue-50">{publishedFile.symbol}</h1>
              <p className="mt-2 text-lg text-blue-100/90">{publishedFile.companyName || analysisSymbol}</p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-[13px] text-blue-100/80">
                <p>
                  <span className="font-semibold text-blue-200">Published:</span>{' '}
                  {formatDateTime(publishedFile.publishedAt)}
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
                  Projected growth for each of the cases (short-term rate over {dcfHorizonLabel} in the DCF model).
                </p>
                <p className="mt-1 text-[12px] text-amber-100/85">
                  Disclaimer: Likelihoods are estimates provided by the publisher.
                </p>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {scenarioTopMetrics.map(({ option, scenario, dcfValue: scenarioDcfValue }) => (
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
                      <p className="mt-1 text-[12px] text-blue-100/85">
                        <span className="font-semibold text-blue-200">DCF / Share:</span>{' '}
                        {scenarioDcfValue !== null ? `$${formatCurrency(scenarioDcfValue)}` : '—'}
                      </p>
                    </div>
                  ))}
                </div>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-12 px-4 font-sans text-slate-100">
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
                <button
                  onClick={togglePublicReviewOptIn}
                  disabled={!isSignedIn}
                  className={`px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                    publicReviewOptIn
                      ? 'bg-blue-500/15 border border-blue-300/35 text-blue-100 hover:bg-blue-500/25'
                      : 'bg-white/10 border border-white/15 text-blue-50 hover:bg-white/15'
                  }`}
                >
                  Public Review: {publicReviewOptIn ? 'On' : 'Off'}
                </button>
                <Link
                  href={`/analysis/${encodeURIComponent(analysisSymbol)}?view=1`}
                  className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all"
                >
                  View
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

        {!isSignedIn && !isViewMode && (
          <div className="mb-5 rounded-xl border border-blue-300/25 bg-blue-500/10 px-4 py-3 text-xs font-semibold text-blue-100">
            Sign in to toggle public review sharing for this analysis file.
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
              label="DCF Value / Share"
              value={dcfValue !== null ? `$${formatCurrency(dcfValue)}` : '—'}
              badgeText={valuationGap ? formatPercent(valuationGap.differencePct) : undefined}
              badgeClassName={valuationGap ? (valuationGap.differencePct >= 0 ? 'text-emerald-300' : 'text-rose-300') : undefined}
              actionLabel={isViewMode ? undefined : showDcfInputs ? 'Hide DCF inputs' : 'Show DCF inputs'}
              onAction={isViewMode ? undefined : toggleDcfInputs}
            />
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
                <div className="grid grid-cols-1 sm:grid-cols-[180px_180px_1fr] gap-3 items-end">
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
                    <label
                      className={`block text-[10px] font-semibold uppercase tracking-[0.1em] mb-1 ${
                        activeScenario === 'conservative'
                          ? 'text-rose-200'
                          : activeScenario === 'base'
                            ? 'text-amber-200'
                            : 'text-emerald-200'
                      }`}
                    >
                      Likelihood (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={activeScenarioData.likelihood}
                      onChange={(event) => updateScenario(activeScenario, { likelihood: event.target.value })}
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

            <div className="mt-4">
              <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">
                Summary Of All Cases
              </label>
              <textarea
                value={casesSummary}
                onChange={(event) => setCasesSummary(event.target.value)}
                placeholder="Write a concise summary that compares the bearish, base, and bullish outcomes..."
                readOnly={isViewMode}
                className={`w-full min-h-[120px] px-4 py-3 bg-slate-800/70 text-slate-100 border border-white/10 rounded-xl text-sm font-medium focus:outline-none ${
                  isViewMode ? 'cursor-default' : 'focus:border-blue-400'
                }`}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-blue-50">{activeScenarioLabel} Write-Up</h2>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">Write-Up</label>
              <textarea
                value={activeScenarioData.analysis}
                onChange={(event) => updateScenario(activeScenario, { analysis: event.target.value })}
                placeholder={`Write your ${activeScenarioLabel.toLowerCase()} write-up here…`}
                readOnly={isViewMode}
                className={`w-full min-h-[380px] px-4 py-3 bg-slate-800/70 text-slate-100 border border-white/10 rounded-xl text-sm font-medium focus:outline-none ${
                  isViewMode ? 'cursor-default' : 'focus:border-blue-400'
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
