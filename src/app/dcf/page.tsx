'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { calculateDCF } from '../../lib/dcf';
import PortfoLogo from '../../components/branding/PortfoLogo';

type FormState = {
  symbol: string;
  fcf: string;
  growthRate: string;
  discountRate: string;
  terminalGrowth: string;
  years: string;
  sharesOutstanding: string;
  cashEquivalent: string;
  totalDebt: string;
};

const initialForm: FormState = {
  symbol: 'AAPL',
  fcf: '',
  growthRate: '',
  discountRate: '',
  terminalGrowth: '',
  years: '5',
  sharesOutstanding: '',
  cashEquivalent: '0',
  totalDebt: '0',
};

const percentFields: Array<keyof FormState> = ['growthRate', 'discountRate', 'terminalGrowth'];

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export default function DCFPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<ReturnType<typeof calculateDCF> | null>(null);
  const [error, setError] = useState('');
  const [showDcfDescription, setShowDcfDescription] = useState(false);
  const [showMathDemo, setShowMathDemo] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const parsedValues = useMemo(() => {
    return {
      fcf: Number(form.fcf),
      growthRate: Number(form.growthRate),
      discountRate: Number(form.discountRate),
      terminalGrowth: Number(form.terminalGrowth),
      years: Number(form.years),
      sharesOutstanding: Number(form.sharesOutstanding),
      cashEquivalent: Number(form.cashEquivalent),
      totalDebt: Number(form.totalDebt),
    };
  }, [form]);

  const denominator = parsedValues.discountRate - parsedValues.terminalGrowth;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSymbolChange = async (query: string) => {
    const upperQuery = query.toUpperCase();
    handleChange('symbol', upperQuery);

    if (upperQuery.length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(upperQuery)}`);
      const data = await res.json();
      setSuggestions(data.result || []);
      setShowDropdown(true);
    } catch (searchError) {
      console.error('DCF symbol search error', searchError);
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const applySuggestion = (symbol: string) => {
    handleChange('symbol', symbol.toUpperCase());
    setShowDropdown(false);
  };

  const handleCalculate = () => {
    setError('');

    const requiredFields: Array<keyof FormState> = ['fcf', 'growthRate', 'discountRate', 'terminalGrowth', 'years', 'sharesOutstanding'];
    const hasEmpty = requiredFields.some((field) => form[field].trim() === '');
    if (hasEmpty) {
      setResult(null);
      setError('Please fill out all required fields.');
      return;
    }

    const hasInvalidNumber = Object.entries(parsedValues).some(([, value]) => Number.isNaN(value));
    if (hasInvalidNumber) {
      setResult(null);
      setError('All fields must contain valid numbers.');
      return;
    }

    try {
      const calculated = calculateDCF(parsedValues);
      setResult(calculated);
    } catch (calculationError) {
      setResult(null);
      setError(calculationError instanceof Error ? calculationError.message : 'Calculation failed.');
    }
  };

  return (
    <div className="min-h-screen bg-market-mesh py-12 px-4 font-sans text-slate-100">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <PortfoLogo
              className="mb-2"
              iconClassName="h-10 w-10 shrink-0"
              textClassName="text-[40px] font-black tracking-tight leading-none text-transparent bg-clip-text bg-gradient-to-r from-slate-300 via-slate-200 to-emerald-300"
            />
            <h1 className="text-3xl font-black tracking-tight">DCF Calculator</h1>
            <p className="text-xs font-semibold text-blue-200 uppercase tracking-[0.18em] mt-2">
              Discounted Cash Flow Model
            </p>
          </div>

          <Link
            href="/dashboard"
            className="px-5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all shadow-sm active:scale-95"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 p-6 lg:sticky lg:top-6 backdrop-blur-md">
            <button
              onClick={() => setShowDcfDescription((prev) => !prev)}
              className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all text-left mb-3"
            >
              {showDcfDescription ? 'Hide DCF Description ▲' : 'What Is DCF? ▼'}
            </button>

            {showDcfDescription && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-3">
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.12em] mb-2">Plain-English Overview</p>
                <p className="text-sm text-blue-100/90 leading-relaxed">
                  DCF estimates what a company is worth today by forecasting its future cash flows and then discounting
                  those future amounts back to present value. It combines the value of projected yearly cash flows with
                  a terminal value, adjusts for cash and debt to get equity value, and then divides by shares outstanding
                  to estimate intrinsic value per share.
                </p>
              </div>
            )}

            <button
              onClick={() => setShowMathDemo((prev) => !prev)}
              className="w-full px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-[12px] font-semibold text-blue-50 hover:bg-white/15 transition-all text-left"
            >
              {showMathDemo ? 'Hide Math Demonstration ▲' : 'Show Math Demonstration ▼'}
            </button>

            {showMathDemo && (
              <>
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.12em] mt-4 mb-5">How DCF Is Calculated</p>
                <div className="space-y-4 text-sm">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-1">1) Project Cash Flows</p>
                    <p className="font-semibold text-blue-50">FCFᵧ = FCF₀ × (1 + g)^y</p>
                    <p className="text-xs text-blue-200/70 mt-1">Using: {formatNumber(parsedValues.fcf, 2)} × (1 + {formatNumber(parsedValues.growthRate)})^y</p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-1">2) Discount Each Year</p>
                    <p className="font-semibold text-blue-50">PVᵧ = FCFᵧ / (1 + r)^y</p>
                    <p className="text-xs text-blue-200/70 mt-1">Using: FCFᵧ / (1 + {formatNumber(parsedValues.discountRate)})^y</p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-1">3) Terminal Value</p>
                    <p className="font-semibold text-blue-50">TV = FCFₙ × (1 + gₜ) / (r - gₜ)</p>
                    <p className="text-xs text-blue-200/70 mt-1">
                      Denominator: {formatNumber(parsedValues.discountRate)} - {formatNumber(parsedValues.terminalGrowth)} = {formatNumber(denominator)}
                    </p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-1">4) Equity & Per Share</p>
                    <p className="font-semibold text-blue-50">Equity = EV + Cash - Debt</p>
                    <p className="font-semibold text-blue-50">Value/Share = Equity / Shares</p>
                    <p className="text-xs text-blue-200/70 mt-1">Shares input: {formatNumber(parsedValues.sharesOutstanding, 2)}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
              <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-end">
                <div className="w-full md:max-w-[220px] relative" ref={dropdownRef}>
                  <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={form.symbol}
                    onChange={(event) => handleSymbolChange(event.target.value)}
                    onFocus={() => setShowDropdown(suggestions.length > 0)}
                    className="w-full px-4 py-3 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
                    placeholder="AAPL"
                  />

                  {showDropdown && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
                      {suggestions.map((item) => (
                        <button
                          key={item.symbol}
                          onClick={() => applySuggestion(item.symbol)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/10 last:border-0"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm text-slate-100">{item.symbol}</span>
                            <span className="text-[9px] text-blue-200/70 font-semibold uppercase truncate max-w-[150px]">
                              {item.description}
                            </span>
                          </div>
                          <span className="text-blue-300 font-semibold text-[10px] uppercase">Select</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {([
                  ['fcf', 'Latest Free Cash Flow (FCF)'],
                  ['growthRate', 'Growth Rate (e.g. 0.08)'],
                  ['discountRate', 'Discount Rate (e.g. 0.10)'],
                  ['terminalGrowth', 'Terminal Growth (e.g. 0.025)'],
                  ['years', 'Projection Years'],
                  ['sharesOutstanding', 'Shares Outstanding'],
                  ['cashEquivalent', 'Cash & Cash Equivalent'],
                  ['totalDebt', 'Total Debt'],
                ] as Array<[keyof FormState, string]>).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-[11px] font-semibold text-blue-200 uppercase tracking-[0.1em] mb-2">
                      {label}
                    </label>
                    <input
                      type="number"
                      step={percentFields.includes(key) ? '0.001' : 'any'}
                      value={form[key]}
                      onChange={(event) => handleChange(key, event.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/80 text-slate-100 border border-white/10 focus:border-blue-400 rounded-xl font-semibold focus:outline-none focus:bg-slate-800 transition-all text-sm"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleCalculate}
                className="mt-8 w-full px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm active:scale-[0.99]"
              >
                Calculate
              </button>

              {error && (
                <div className="mt-5 px-4 py-3 bg-rose-500/10 border border-rose-400/30 rounded-xl text-rose-300 text-sm font-semibold">
                  {error}
                </div>
              )}
            </div>

            {result && !error && (
              <div className="mt-6 bg-slate-900/65 rounded-2xl shadow-sm border border-white/10 p-8 backdrop-blur-md">
                <h2 className="text-lg font-semibold text-blue-50 mb-5">Results</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResultCard label="Enterprise Value" value={`$${formatCurrency(result.enterpriseValue)}`} />
                  <ResultCard label="Equity Value" value={`$${formatCurrency(result.equityValue)}`} />
                  <ResultCard label="Intrinsic Value / Share" value={`$${formatCurrency(result.intrinsicValuePerShare)}`} />
                  <ResultCard label="PV of Terminal Value" value={`$${formatCurrency(result.pvTerminalValue)}`} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-200">{label}</p>
      <p className="text-xl font-semibold mt-2 text-slate-100">{value}</p>
    </div>
  );
}
