'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { calculateDCF } from '../../lib/dcf';

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
    <div className="min-h-screen bg-[#fafafa] py-12 px-4 font-sans text-gray-900">
      <div className="max-w-[1300px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">DCF Calculator</h1>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.25em] mt-2">
              Discounted Cash Flow Model
            </p>
          </div>

          <Link
            href="/dashboard"
            className="px-5 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          <div className="bg-white rounded-[2rem] shadow-[0_30px_70px_rgba(0,0,0,0.04)] border border-gray-100 p-6 lg:sticky lg:top-6">
            <button
              onClick={() => setShowDcfDescription((prev) => !prev)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all text-left mb-3"
            >
              {showDcfDescription ? 'Hide DCF Description ▲' : 'What Is DCF? ▼'}
            </button>

            {showDcfDescription && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Plain-English Overview</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  DCF estimates what a company is worth today by forecasting its future cash flows and then discounting
                  those future amounts back to present value. It combines the value of projected yearly cash flows with
                  a terminal value, adjusts for cash and debt to get equity value, and then divides by shares outstanding
                  to estimate intrinsic value per share.
                </p>
              </div>
            )}

            <button
              onClick={() => setShowMathDemo((prev) => !prev)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all text-left"
            >
              {showMathDemo ? 'Hide Math Demonstration ▲' : 'Show Math Demonstration ▼'}
            </button>

            {showMathDemo && (
              <>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.22em] mt-4 mb-5">How DCF Is Calculated</p>
                <div className="space-y-4 text-sm">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">1) Project Cash Flows</p>
                    <p className="font-bold text-gray-700">FCFᵧ = FCF₀ × (1 + g)^y</p>
                    <p className="text-xs text-gray-500 mt-1">Using: {formatNumber(parsedValues.fcf, 2)} × (1 + {formatNumber(parsedValues.growthRate)})^y</p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">2) Discount Each Year</p>
                    <p className="font-bold text-gray-700">PVᵧ = FCFᵧ / (1 + r)^y</p>
                    <p className="text-xs text-gray-500 mt-1">Using: FCFᵧ / (1 + {formatNumber(parsedValues.discountRate)})^y</p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">3) Terminal Value</p>
                    <p className="font-bold text-gray-700">TV = FCFₙ × (1 + gₜ) / (r - gₜ)</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Denominator: {formatNumber(parsedValues.discountRate)} - {formatNumber(parsedValues.terminalGrowth)} = {formatNumber(denominator)}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">4) Equity & Per Share</p>
                    <p className="font-bold text-gray-700">Equity = EV + Cash - Debt</p>
                    <p className="font-bold text-gray-700">Value/Share = Equity / Shares</p>
                    <p className="text-xs text-gray-500 mt-1">Shares input: {formatNumber(parsedValues.sharesOutstanding, 2)}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="bg-white rounded-[2rem] shadow-[0_30px_70px_rgba(0,0,0,0.04)] border border-gray-100 p-8">
              <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-end">
                <div className="w-full md:max-w-[220px] relative" ref={dropdownRef}>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={form.symbol}
                    onChange={(event) => handleSymbolChange(event.target.value)}
                    onFocus={() => setShowDropdown(suggestions.length > 0)}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-2xl font-bold focus:outline-none focus:bg-white transition-all text-sm"
                    placeholder="AAPL"
                  />

                  {showDropdown && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden py-2">
                      {suggestions.map((item) => (
                        <button
                          key={item.symbol}
                          onClick={() => applySuggestion(item.symbol)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-black text-sm">{item.symbol}</span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase truncate max-w-[150px]">
                              {item.description}
                            </span>
                          </div>
                          <span className="text-blue-500 font-bold text-[10px] uppercase">Select</span>
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
                    <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">
                      {label}
                    </label>
                    <input
                      type="number"
                      step={percentFields.includes(key) ? '0.001' : 'any'}
                      value={form[key]}
                      onChange={(event) => handleChange(key, event.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-2xl font-bold focus:outline-none focus:bg-white transition-all text-sm"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleCalculate}
                className="mt-8 w-full px-6 py-3 bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 active:scale-[0.99]"
              >
                Calculate
              </button>

              {error && (
                <div className="mt-5 px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm font-bold">
                  {error}
                </div>
              )}
            </div>

            {result && !error && (
              <div className="mt-6 bg-white rounded-[2rem] shadow-[0_30px_70px_rgba(0,0,0,0.04)] border border-gray-100 p-8">
                <h2 className="text-lg font-black mb-5">Results</h2>
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
    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-xl font-black mt-2 text-gray-900">{value}</p>
    </div>
  );
}
