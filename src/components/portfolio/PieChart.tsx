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

    // pick a color per slice from a fixed palette (repeats if more symbols than colors)
    const palette = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444'];
    const color = palette[idx % palette.length];
    const path = `M${center},${center} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;
    return <path key={idx} d={path} fill={color} />;
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
        {paths}
      </svg>
      <div className="mt-4 text-sm">
        {data.map((s, idx) => (
          <div key={s.symbol} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444'][idx % 7] }}
            />
            <span className="font-bold">
              {s.symbol}: ${s.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
