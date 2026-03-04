import { useId } from 'react';

type PortfoLogoProps = {
  className?: string;
};

export default function PortfoLogo({ className = 'h-16 w-auto' }: PortfoLogoProps) {
  const baseId = useId().replace(/:/g, '');
  const fillGradientId = `${baseId}-triangle-fill`;
  const shineGradientId = `${baseId}-triangle-shine`;
  const wordGradientId = `${baseId}-word-fill`;

  return (
    <svg
      viewBox="0 0 540 140"
      className={className}
      role="img"
      aria-label="PortFo logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={fillGradientId} x1="8%" y1="92%" x2="84%" y2="12%">
          <stop offset="0%" stopColor="#064e3b" />
          <stop offset="42%" stopColor="#10b981" />
          <stop offset="72%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={shineGradientId} x1="18%" y1="8%" x2="82%" y2="82%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.75)" />
          <stop offset="55%" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>
        <linearGradient id={wordGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9ca3af" />
          <stop offset="45%" stopColor="#d1d5db" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      <path
        d="M60 12 L108 100 H12 Z"
        fill={`url(#${fillGradientId})`}
        stroke="#34d399"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M60 24 L94 94 H26 Z"
        fill={`url(#${shineGradientId})`}
      />

      <text
        x="124"
        y="104"
        fill={`url(#${wordGradientId})`}
        fontFamily="Inter, Arial, sans-serif"
        fontSize="84"
        fontWeight="800"
        letterSpacing="2"
      >
        PORTFO
      </text>
    </svg>
  );
}
