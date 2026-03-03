'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { calculateDCF } from '../../lib/dcf';

type FormState = {
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

export default function DCFPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<ReturnType<typeof calculateDCF> | null>(null);
  const [error, setError] = useState('');

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

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      <div className="max-w-[1000px] mx-auto">
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

        <div className="bg-white rounded-[2rem] shadow-[0_30px_70px_rgba(0,0,0,0.04)] border border-gray-100 p-8">
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
