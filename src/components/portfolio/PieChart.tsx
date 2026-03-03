'use client';
import React from 'react';

interface Slice {
  symbol: string;
  value: number;
}

interface Props {
  data: Slice[];
}

export default function PieChart({ data }: Props) {
  const total = data.reduce((sum, s) => sum + Math.abs(s.value), 0);
  const palette = ['#60A5FA', '#A78BFA', '#34D399', '#F59E0B', '#F472B6', '#38BDF8', '#F87171'];

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 backdrop-blur-md p-6 text-center text-blue-100/80">
        No chart data yet.
      </div>
    );
  }

  let cumulative = 0;
  const radius = 100;
  const center = radius;

  const paths = data.map((s, idx) => {
    const value = Math.abs(s.value);
    const startAngle = (2 * Math.PI * cumulative) / total;
    const endAngle = (2 * Math.PI * (cumulative + value)) / total;
    cumulative += value;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    const color = palette[idx % palette.length];
    const path = `M${center},${center} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;
    return <path key={idx} d={path} fill={color} />;
  });

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-slate-900/65 backdrop-blur-md p-6">
      <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
        {paths}
        <circle cx={center} cy={center} r={42} fill="#0F172A" stroke="#1E293B" strokeWidth="1" />
        <text x={center} y={center - 2} textAnchor="middle" fill="#BFDBFE" fontSize="10" fontWeight="600">TOTAL</text>
        <text x={center} y={center + 16} textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="700">
          ${total.toFixed(0)}
        </text>
      </svg>
      <div className="mt-4 text-sm w-full max-w-[340px] space-y-2">
        {data.map((s, idx) => (
          <div key={s.symbol} className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: palette[idx % palette.length] }}
            />
              <span className="font-semibold text-slate-100 truncate">{s.symbol}</span>
            </div>
            <span className="font-semibold text-blue-200 tabular-nums">
              ${s.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
