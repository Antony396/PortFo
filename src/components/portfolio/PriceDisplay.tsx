'use client';
import { useEffect, useState } from 'react';

export default function PriceDisplay({ symbol, avgPrice, quantity, children, compact = false, mobileSummary = false }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrice() {
      try {
        setLoading(true);
        const response = await fetch(`/api/price/${symbol}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const result = await response.json();
        setData(result);
      } catch (e) {
        console.error("Error fetching price for", symbol, e);
      } finally {
        setLoading(false);
      }
    }
    fetchPrice();
  }, [symbol]);

  // Show a skeleton while loading the very first time
  if (loading && !data) {
    if (mobileSummary) {
      return (
        <div className="grid grid-cols-12 items-center w-full h-16 bg-white/5 animate-pulse rounded-xl px-3 gap-2">
          <div className="col-span-5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/10" />
            <div className="h-3 w-12 bg-white/10 rounded" />
          </div>
          <div className="col-span-3 h-3 bg-white/10 rounded" />
          <div className="col-span-4 h-3 bg-white/10 rounded" />
        </div>
      );
    }

    return (
      <div className={`grid grid-cols-12 items-center w-full bg-white/5 animate-pulse ${compact ? 'h-16 rounded-xl px-4' : 'h-24 rounded-[2rem] px-8'}`}>
        <div className={`col-span-2 flex items-center ${compact ? 'gap-2' : 'gap-4'}`}>
          <div className={`${compact ? 'w-8 h-8 rounded-lg' : 'w-12 h-12 rounded-2xl'} bg-white/10`} />
          <div className={`h-4 ${compact ? 'w-10' : 'w-20'} bg-white/10 rounded`} />
        </div>
        <div className="col-span-3">{children}</div>
      </div>
    );
  }

  // Fallback values if API fails so the app doesn't crash
  const currentPrice = data?.currentPrice ?? 0;
  const currentTotalValue = currentPrice * quantity;
  const totalCost = avgPrice * quantity;
  const totalGainedDollars = currentTotalValue - totalCost;
  const totalReturnPercent = (avgPrice > 0 && totalCost > 0) ? (totalGainedDollars / totalCost) * 100 : 0;
  
  const isGain = totalGainedDollars >= 0;
  const isDayPositive = (data?.percentChange ?? 0) >= 0;

  if (mobileSummary) {
    return (
      <div className="grid grid-cols-12 items-center w-full gap-2">
        <div className="col-span-5 flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center shrink-0 shadow-sm p-1 transition-transform hover:scale-105">
            {data?.logo ? (
              <img
                src={data.logo}
                alt={symbol}
                className="w-full h-full object-contain rounded-md overflow-hidden"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-[8px] bg-white/10 text-blue-200/80 rounded-md">
                {symbol.substring(0, 3)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <span className="block font-extrabold text-slate-100 text-[12px] truncate leading-none">{symbol}</span>
            <span className="block text-[9px] font-semibold text-blue-200/70 truncate mt-0.5">
              {data?.companyName || 'Unknown Corp'}
            </span>
          </div>
        </div>

        <div className="col-span-3 flex justify-end tabular-nums">
          <span className="font-bold text-slate-100 text-[12px] leading-none">
            ${currentTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="col-span-4 flex flex-col items-end tabular-nums">
          <span className={`font-bold text-[12px] leading-none ${isGain ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isGain ? '+' : '-'}${Math.abs(totalGainedDollars).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span className={`mt-0.5 text-[9px] font-black uppercase ${isGain ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
            {totalReturnPercent.toFixed(2)}%
          </span>
        </div>

        {children && (
          <div className="col-span-12 mt-2">{children}</div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 items-center w-full">
      {/* 1. ASSET SECTION */}
      <div className={`col-span-2 flex items-center min-w-0 ${compact ? 'gap-2' : 'gap-4'}`}>
        <div className={`${compact ? 'w-8 h-8 rounded-lg p-1' : 'w-12 h-12 rounded-2xl p-1.5'} bg-white/10 border border-white/10 flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105`}>
          {data?.logo ? (
            <img 
              src={data.logo} 
              alt={symbol} 
              className="w-full h-full object-contain rounded-xl overflow-hidden" 
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center font-bold ${compact ? 'text-[8px]' : 'text-[10px]'} bg-white/10 text-blue-200/80 rounded-xl`}>
              {symbol.substring(0,3)}
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`font-extrabold text-slate-100 truncate leading-none ${compact ? 'text-[11px]' : 'text-lg'}`}>{symbol}</span>
          <span className={`${compact ? 'hidden' : 'text-[10px] font-bold text-blue-200/70 uppercase mt-1 truncate'}`}>
            {data?.companyName || 'Unknown Corp'}
          </span>
        </div>
      </div>

      {/* 2. INPUTS (Avg Price & Shares) - These are passed from page.tsx */}
      <div className="col-span-3">
        {children}
      </div>

      {/* 3. PRICE */}
      <div className="col-span-2 flex flex-col items-end tabular-nums">
        <span className={`font-bold text-slate-100 leading-none ${compact ? 'text-[11px]' : 'text-lg'}`}>
          ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* 4. DAY CHG */}
      <div className="col-span-2 flex justify-center">
        <div className={`${compact ? 'px-1 py-0.5 text-[9px] rounded-md' : 'px-2 py-0.5 rounded-lg text-[11px]'} font-bold ${isDayPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {isDayPositive ? '▲' : '▼'}{Math.abs(data?.percentChange ?? 0).toFixed(2)}%
        </div>
      </div>

      {/* 5. TOTAL VALUE */}
      <div className="col-span-1 flex flex-col items-end tabular-nums">
        <span className={`font-bold text-slate-100 leading-none ${compact ? 'text-[11px]' : 'text-lg'}`}>
          ${currentTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* 6. PROFIT/LOSS */}
      <div className="col-span-2 flex flex-col items-end tabular-nums">
        <span className={`font-bold leading-none ${compact ? 'text-[11px]' : 'text-lg'} ${isGain ? 'text-emerald-500' : 'text-rose-500'}`}>
          {isGain ? '+' : '-'}${Math.abs(totalGainedDollars).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
        <span className={`${compact ? 'mt-0.5 text-[8px]' : 'mt-1 text-[10px]'} font-black uppercase ${isGain ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
          {totalReturnPercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}