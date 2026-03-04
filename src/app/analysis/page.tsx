'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

type Suggestion = {
  symbol: string;
  description: string;
};

type FilingRecord = {
  symbol: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  hasPublished: boolean;
};

type StorageMode = 'unknown' | 'database' | 'local';

const FILINGS_KEY = 'portfo_stock_analysis_filings_v1';
const ANALYSIS_DRAFT_KEY_PREFIX = 'portfo_stock_analysis_draft_v1_';
const ACCOUNT_ANALYSIS_FILINGS_BACKUP_PREFIX = 'portfo_account_analysis_filings_backup_v1_';
const ACCOUNT_ANALYSIS_DRAFT_BACKUP_PREFIX = 'portfo_account_analysis_draft_backup_v1_';

function normalizeFilings(items: unknown): FilingRecord[] {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => {
      const entry = item as Partial<FilingRecord>;
      const symbol = typeof entry.symbol === 'string' ? entry.symbol.trim().toUpperCase() : '';
      const companyName = typeof entry.companyName === 'string' ? entry.companyName : '';
      const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : '';
      const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : '';
      const publishedAt = typeof entry.publishedAt === 'string' ? entry.publishedAt : '';

      if (!symbol) return null;

      const now = new Date().toISOString();
      return {
        symbol,
        companyName: companyName || symbol,
        createdAt: createdAt || now,
        updatedAt: updatedAt || createdAt || now,
        publishedAt,
        hasPublished: Boolean(publishedAt),
      };
    })
    .filter((item): item is FilingRecord => Boolean(item));
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '—';

  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AnalysisPage() {
  const { user, isSignedIn, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const [symbolInput, setSymbolInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filingsTableScrollRef = useRef<HTMLDivElement>(null);
  const previousAuthStateRef = useRef<boolean | null>(null);

  const [filings, setFilings] = useState<FilingRecord[]>([]);
  const [isFilingsLoaded, setIsFilingsLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingSymbol, setRemovingSymbol] = useState<string | null>(null);
  const [confirmDeleteSymbol, setConfirmDeleteSymbol] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>('unknown');
  const [status, setStatus] = useState('');

  const getAccountFilingsBackupKey = (userId: string) => `${ACCOUNT_ANALYSIS_FILINGS_BACKUP_PREFIX}${userId}`;
  const getAccountDraftBackupKey = (userId: string, symbol: string) =>
    `${ACCOUNT_ANALYSIS_DRAFT_BACKUP_PREFIX}${userId}_${symbol.trim().toUpperCase()}`;

  const saveAccountFilingsBackup = (userId: string, items: FilingRecord[]) => {
    try {
      const normalizedItems = normalizeFilings(items);
      const key = getAccountFilingsBackupKey(userId);

      if (normalizedItems.length === 0) {
        const existingRaw = localStorage.getItem(key);
        if (existingRaw) {
          const existingItems = normalizeFilings(JSON.parse(existingRaw) as unknown);
          if (existingItems.length > 0) {
            return;
          }
        }
      }

      localStorage.setItem(key, JSON.stringify(normalizedItems));
    } catch (error) {
      console.error('Failed to save account analysis filings backup', error);
    }
  };

  const loadAccountFilingsBackup = (userId: string): FilingRecord[] | null => {
    try {
      const raw = localStorage.getItem(getAccountFilingsBackupKey(userId));
      if (!raw) return null;

      return normalizeFilings(JSON.parse(raw) as unknown);
    } catch (error) {
      console.error('Failed to load account analysis filings backup', error);
      return null;
    }
  };

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
      setFilings([]);
      setStorageMode('local');
      setStatus('Logged out. Analysis table reset to default state.');
      setIsFilingsLoaded(true);
    }

    previousAuthStateRef.current = isSignedIn;
  }, [isSignedIn, isUserLoaded]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isUserLoaded) return;

    setStorageMode('unknown');
    const signedInUserId = typeof user?.id === 'string' ? user.id : '';

    const loadLocalFilings = () => {
      try {
        const rawFilings = localStorage.getItem(FILINGS_KEY);
        if (!rawFilings) {
          setFilings([]);
          setStorageMode('local');
          return;
        }

        const parsed = JSON.parse(rawFilings) as FilingRecord[];
        setFilings(normalizeFilings(parsed));
        setStorageMode('local');
      } catch (error) {
        console.error('Failed to load stock analysis filings', error);
        setFilings([]);
        setStorageMode('local');
      }
    };

    const restoreFromAccountBackup = () => {
      if (!signedInUserId) return false;
      const backup = loadAccountFilingsBackup(signedInUserId);
      if (!backup) return false;

      setFilings(backup);
      setStorageMode('local');
      setStatus('Recovered filings from account backup while cloud sync was unavailable.');
      return true;
    };

    const loadFilings = async () => {
      if (!isSignedIn) {
        loadLocalFilings();
        setIsFilingsLoaded(true);
        return;
      }

      try {
        const response = await fetch('/api/analysis', { cache: 'no-store' });

        if (!response.ok) {
          if (restoreFromAccountBackup()) {
            setIsFilingsLoaded(true);
            return;
          }
          loadLocalFilings();
          setIsFilingsLoaded(true);
          return;
        }

        const data = await response.json();
        const dbFilings = normalizeFilings(data?.filings);

        if (data?.storage === 'database') {
          setFilings(dbFilings);
          setStorageMode('database');
          if (signedInUserId) {
            saveAccountFilingsBackup(signedInUserId, dbFilings);
          }
        } else {
          if (restoreFromAccountBackup()) {
            return;
          }
          loadLocalFilings();
        }
      } catch (error) {
        console.error('Failed to load account analysis filings', error);
        if (restoreFromAccountBackup()) {
          return;
        }
        loadLocalFilings();
      } finally {
        setIsFilingsLoaded(true);
      }
    };

    loadFilings();
  }, [isSignedIn, isUserLoaded, user?.id]);

  useEffect(() => {
    if (!isFilingsLoaded) return;
    localStorage.setItem(FILINGS_KEY, JSON.stringify(filings));
  }, [filings, isFilingsLoaded]);

  useEffect(() => {
    if (!isUserLoaded || !isSignedIn || !isFilingsLoaded || !user?.id) return;
    saveAccountFilingsBackup(user.id, filings);
  }, [filings, isFilingsLoaded, isSignedIn, isUserLoaded, user?.id]);

  const saveFilingToAccount = async (record: FilingRecord) => {
    if (!isSignedIn) return false;

    try {
      const response = await fetch('/api/analysis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: record.symbol,
          companyName: record.companyName,
        }),
      });

      if (response.ok) {
        setStorageMode('database');
      } else {
        setStorageMode('local');
      }

      return response.ok;
    } catch (error) {
      console.error('Failed to save filing to account', error);
      setStorageMode('local');
      return false;
    }
  };

  const handleSearchChange = async (query: string) => {
    const upperQuery = query.toUpperCase();
    setSymbolInput(upperQuery);
    setStatus('');

    if (!upperQuery.trim()) {
      setSuggestions([]);
      setIsSearching(false);
      setShowDropdown(false);
      return;
    }

    setShowDropdown(true);
    setIsSearching(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(upperQuery)}`);
      const data = await response.json();
      const unique = (data.result || []).filter(
        (item: Suggestion, index: number, arr: Suggestion[]) =>
          arr.findIndex((entry) => entry.symbol === item.symbol) === index,
      );
      setSuggestions(unique.slice(0, 10));
      setShowDropdown(true);
    } catch (error) {
      console.error('Analysis filing search failed', error);
      setSuggestions([]);
      setShowDropdown(true);
    } finally {
      setIsSearching(false);
    }
  };

  const addStockToFilings = async () => {
    const ticker = symbolInput.trim().toUpperCase();
    if (!ticker) {
      setStatus('Enter a symbol first.');
      return;
    }

    if (filings.some((item) => item.symbol === ticker)) {
      setStatus('This stock is already in your filings table.');
      return;
    }

    setIsAdding(true);
    setStatus('');

    let companyName = ticker;
    try {
      const response = await fetch(`/api/price/${encodeURIComponent(ticker)}`);
      if (response.ok) {
        const data = (await response.json()) as { companyName?: string };
        if (typeof data.companyName === 'string' && data.companyName.trim()) {
          companyName = data.companyName;
        }
      }
    } catch (error) {
      console.error('Failed to fetch company profile for filing row', error);
    }

    const now = new Date().toISOString();
    const record: FilingRecord = {
      symbol: ticker,
      companyName,
      createdAt: now,
      updatedAt: now,
      publishedAt: '',
      hasPublished: false,
    };
    setFilings((prev) => [record, ...prev]);
    setSymbolInput('');
    setSuggestions([]);
    setShowDropdown(false);

    let accountSaved = false;
    if (isSignedIn) {
      accountSaved = await saveFilingToAccount(record);
    }

    setStatus(
      isSignedIn
        ? accountSaved
          ? 'Added to filings and saved to account.'
          : 'Added to filings locally. Account save is unavailable.'
        : 'Added to filings. Click the symbol to open your write-up.',
    );
    setIsAdding(false);
  };

  const openFiling = async (symbol: string, viewOnly = false) => {
    const now = new Date().toISOString();
    let updatedRecord: FilingRecord | null = null;

    setFilings((prev) =>
      prev.map((item) =>
        item.symbol === symbol
          ? {
              ...item,
              updatedAt: now,
            }
          : item,
      ),
    );

    const existing = filings.find((item) => item.symbol === symbol);
    if (existing) {
      updatedRecord = { ...existing, updatedAt: now };
    }

    if (updatedRecord) {
      await saveFilingToAccount(updatedRecord);
    }

    router.push(`/analysis/${encodeURIComponent(symbol)}${viewOnly ? '?view=1' : ''}`);
  };

  const viewPublishedFiling = (symbol: string) => {
    void openFiling(symbol, true);
  };

  const removeFiling = async (symbol: string) => {
    setRemovingSymbol(symbol);
    setStatus('');

    setFilings((prev) => prev.filter((item) => item.symbol !== symbol));
    localStorage.removeItem(`${ANALYSIS_DRAFT_KEY_PREFIX}${symbol}`);
    if (isSignedIn && user?.id) {
      localStorage.removeItem(getAccountDraftBackupKey(user.id, symbol));
    }

    if (!isSignedIn) {
      setStatus(`${symbol} removed from your filings table.`);
      setRemovingSymbol(null);
      return;
    }

    try {
      const response = await fetch(`/api/analysis/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      });

      setStatus(
        response.ok
          ? `${symbol} removed from your filings table and account database.`
          : `${symbol} removed locally. Could not remove from account database.`,
      );
    } catch (error) {
      console.error('Failed to delete filing from account', error);
      setStatus(`${symbol} removed locally. Could not remove from account database.`);
    } finally {
      setRemovingSymbol(null);
    }
  };

  const confirmRemoveFiling = async () => {
    if (!confirmDeleteSymbol) return;
    await removeFiling(confirmDeleteSymbol);
    setConfirmDeleteSymbol(null);
  };

  const sortedFilings = [...filings].sort(
    (a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt),
  );

  const scrollFilingsTable = (direction: 'left' | 'right') => {
    const container = filingsTableScrollRef.current;
    if (!container) return;

    const amount = direction === 'right' ? 220 : -220;
    container.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 py-12 px-4 font-sans text-slate-100">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Stock Analysis Filings</h1>
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-[0.18em] mt-2">
              Personal Filing Table
            </p>
          </div>

          <Link
            href="/dashboard"
            className="px-5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all shadow-sm active:scale-95"
          >
            Back to Dashboard
          </Link>
        </div>

        {isSignedIn && storageMode === 'local' && (
          <div className="mb-5 rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-100">
            Account sync is unavailable on this deployment right now. Filings are saving to this browser only.
          </div>
        )}

        <div className="relative z-10 bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-6 backdrop-blur-md overflow-visible">
            <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-4">Your Analysis Files</p>

          <div className="relative z-40 mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-3">Add Stock To Table</p>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div className="relative z-50" ref={dropdownRef}>
                  <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={symbolInput}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    onFocus={() => setShowDropdown(symbolInput.trim().length > 0)}
                    className="w-full px-4 py-3 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
                    placeholder="AAPL"
                  />

                  {showDropdown && symbolInput.trim().length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-[70] overflow-hidden py-2">
                      {isSearching ? (
                        <div className="px-4 py-3 text-[11px] font-semibold text-blue-100/85">Searching…</div>
                      ) : suggestions.length > 0 ? (
                        suggestions.map((item) => (
                          <button
                            key={item.symbol}
                            onClick={() => {
                              setSymbolInput(item.symbol.toUpperCase());
                              setShowDropdown(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/10 last:border-0"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-sm text-slate-100">{item.symbol}</span>
                              <span className="text-[9px] text-blue-200/70 font-semibold uppercase truncate max-w-[180px]">
                                {item.description}
                              </span>
                            </div>
                            <span className="text-blue-300 font-semibold text-[10px] uppercase">Use</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-[11px] font-semibold text-blue-100/75">No matches found</div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={addStockToFilings}
                  className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all"
                >
                  {isAdding ? 'Adding…' : 'Add To Filing Table'}
                </button>
              </div>

              {status && (
                <p className="mt-3 text-xs font-semibold text-blue-100/90 leading-relaxed">
                  {status}
                </p>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
              <p className="text-[10px] text-blue-200/70 uppercase tracking-[0.1em]">Swipe to see all table columns</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scrollFilingsTable('left')}
                  className="h-6 min-w-6 px-2 rounded-md border border-white/20 bg-white/10 text-[11px] font-semibold text-blue-100 hover:bg-white/15 transition-all"
                  aria-label="Scroll filings table left"
                >
                  ←
                </button>
                <button
                  onClick={() => scrollFilingsTable('right')}
                  className="h-6 min-w-6 px-2 rounded-md border border-white/20 bg-white/10 text-[11px] font-semibold text-blue-100 hover:bg-white/15 transition-all"
                  aria-label="Scroll filings table right"
                >
                  →
                </button>
              </div>
            </div>

            <div ref={filingsTableScrollRef} className="relative z-10 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-blue-200/80 text-[11px] uppercase tracking-[0.08em]">
                    <th className="py-3 text-left font-semibold">Symbol</th>
                    <th className="py-3 text-left font-semibold">Company</th>
                    <th className="py-3 text-left font-semibold">Created</th>
                    <th className="py-3 text-left font-semibold">Last Opened</th>
                    <th className="py-3 text-left font-semibold hidden md:table-cell">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-blue-100/80 font-medium">
                        No filings yet. Add a stock to start your personal analysis table.
                      </td>
                    </tr>
                  ) : (
                    sortedFilings.map((filing) => (
                      <tr key={filing.symbol} className="border-b border-white/10 last:border-0">
                        <td className="py-4">
                          <button
                            onClick={() => openFiling(filing.symbol)}
                            className="font-semibold text-blue-300 hover:text-blue-100 transition-colors"
                          >
                            {filing.symbol}
                          </button>

                          {filing.publishedAt ? (
                            <p className="mt-1 text-[10px] font-semibold text-emerald-200/90 uppercase tracking-[0.08em]">
                              Published
                            </p>
                          ) : (
                            <p className="mt-1 text-[10px] font-semibold text-blue-200/65 uppercase tracking-[0.08em]">
                              Draft
                            </p>
                          )}

                          <div className="mt-2 flex items-center gap-2 md:hidden">
                            <button
                              onClick={() => viewPublishedFiling(filing.symbol)}
                              className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                                filing.publishedAt
                                  ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                                  : 'border-blue-300/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                              }`}
                            >
                              View
                            </button>
                            <button
                              onClick={() => openFiling(filing.symbol)}
                              className="px-3 py-1.5 rounded-lg border border-amber-300/30 bg-amber-500/10 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20 transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDeleteSymbol(filing.symbol)}
                              disabled={removingSymbol === filing.symbol}
                              className="px-3 py-1.5 rounded-lg border border-rose-300/30 bg-rose-500/10 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {removingSymbol === filing.symbol ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </td>
                        <td className="py-4 text-blue-50">{filing.companyName}</td>
                        <td className="py-4 text-blue-100/85">{formatDate(filing.createdAt)}</td>
                        <td className="py-4 text-blue-100/85">{formatDate(filing.updatedAt)}</td>
                        <td className="py-4 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => viewPublishedFiling(filing.symbol)}
                              className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                                filing.publishedAt
                                  ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                                  : 'border-blue-300/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
                              }`}
                            >
                              View
                            </button>
                            <button
                              onClick={() => openFiling(filing.symbol)}
                              className="px-3 py-1.5 rounded-lg border border-amber-300/30 bg-amber-500/10 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20 transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDeleteSymbol(filing.symbol)}
                              disabled={removingSymbol === filing.symbol}
                              className="px-3 py-1.5 rounded-lg border border-rose-300/30 bg-rose-500/10 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {removingSymbol === filing.symbol ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        {confirmDeleteSymbol && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-2xl shadow-2xl p-5">
              <h2 className="text-base font-semibold text-blue-50">Remove Filing</h2>
              <p className="mt-2 text-sm text-blue-100/85 leading-relaxed">
                Remove <span className="font-semibold text-blue-50">{confirmDeleteSymbol}</span> from your filing table?
                This also removes its saved analysis from your account database when available.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteSymbol(null)}
                  disabled={removingSymbol === confirmDeleteSymbol}
                  className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-[11px] font-semibold text-blue-100 hover:bg-white/15 transition-all disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveFiling}
                  disabled={removingSymbol === confirmDeleteSymbol}
                  className="px-3 py-1.5 rounded-lg border border-rose-300/30 bg-rose-500/10 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 transition-all disabled:opacity-60"
                >
                  {removingSymbol === confirmDeleteSymbol ? 'Removing…' : 'Confirm Remove'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
