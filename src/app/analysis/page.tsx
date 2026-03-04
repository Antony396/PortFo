'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Suggestion = {
  symbol: string;
  description: string;
};

type FilingRecord = {
  symbol: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
};

const FILINGS_KEY = 'portfo_stock_analysis_filings_v1';

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
  const router = useRouter();
  const [symbolInput, setSymbolInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [filings, setFilings] = useState<FilingRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [status, setStatus] = useState('');

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
    try {
      const rawFilings = localStorage.getItem(FILINGS_KEY);
      if (!rawFilings) {
        setIsLoaded(true);
        return;
      }

      const parsed = JSON.parse(rawFilings) as FilingRecord[];
      if (!Array.isArray(parsed)) {
        setIsLoaded(true);
        return;
      }

      const normalized = parsed
        .filter((item) => typeof item?.symbol === 'string' && item.symbol.trim())
        .map((item) => ({
          symbol: item.symbol.trim().toUpperCase(),
          companyName: item.companyName || item.symbol.trim().toUpperCase(),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        }));

      setFilings(normalized);
    } catch (error) {
      console.error('Failed to load stock analysis filings', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(FILINGS_KEY, JSON.stringify(filings));
  }, [filings, isLoaded]);

  const handleSearchChange = async (query: string) => {
    const upperQuery = query.toUpperCase();
    setSymbolInput(upperQuery);
    setStatus('');

    if (!upperQuery.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

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
      setShowDropdown(false);
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
    } finally {
      const now = new Date().toISOString();
      setFilings((prev) => [{ symbol: ticker, companyName, createdAt: now, updatedAt: now }, ...prev]);
      setSymbolInput('');
      setSuggestions([]);
      setShowDropdown(false);
      setIsAdding(false);
      setStatus('Added to filings. Click the symbol to open your write-up.');
    }
  };

  const openFiling = (symbol: string) => {
    const now = new Date().toISOString();
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

    router.push(`/analysis/${encodeURIComponent(symbol)}`);
  };

  const sortedFilings = [...filings].sort(
    (a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt),
  );

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

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-start">
          <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
            <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-3">Add Stock To Table</p>

            <div className="relative" ref={dropdownRef}>
              <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">
                Symbol
              </label>
              <input
                type="text"
                value={symbolInput}
                onChange={(event) => handleSearchChange(event.target.value)}
                onFocus={() => setShowDropdown(suggestions.length > 0)}
                className="w-full px-4 py-3 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
                placeholder="AAPL"
              />

              {showDropdown && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
                  {suggestions.map((item) => (
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
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={addStockToFilings}
              className="mt-4 w-full px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all"
            >
              {isAdding ? 'Adding…' : 'Add To Filing Table'}
            </button>

            {status && (
              <p className="mt-3 text-xs font-semibold text-blue-100/90 leading-relaxed">
                {status}
              </p>
            )}
          </div>

          <div className="bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-6 backdrop-blur-md overflow-hidden">
            <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-4">Your Analysis Files</p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-blue-200/80 text-[11px] uppercase tracking-[0.08em]">
                    <th className="py-3 text-left font-semibold">Symbol</th>
                    <th className="py-3 text-left font-semibold">Company</th>
                    <th className="py-3 text-left font-semibold">Created</th>
                    <th className="py-3 text-left font-semibold">Last Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-blue-100/80 font-medium">
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
                        </td>
                        <td className="py-4 text-blue-50">{filing.companyName}</td>
                        <td className="py-4 text-blue-100/85">{formatDate(filing.createdAt)}</td>
                        <td className="py-4 text-blue-100/85">{formatDate(filing.updatedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
