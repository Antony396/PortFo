import { useId } from 'react';

type PortfoLogoProps = {
  className?: string;
  textClassName?: string;
  iconClassName?: string;
};

export default function PortfoLogo({
  className = '',
  textClassName = 'text-[44px] font-black tracking-tight leading-none text-transparent bg-clip-text bg-gradient-to-r from-slate-300 via-slate-200 to-emerald-300',
  iconClassName = 'h-10 w-10 shrink-0',
}: PortfoLogoProps) {
  const baseId = useId().replace(/:/g, '');
  const fillGradientId = `${baseId}-triangle-fill`;
  const shineGradientId = `${baseId}-triangle-shine`;

  return (
    <div className={`inline-flex items-end gap-[0.9mm] ${className}`.trim()}>
      <svg
        viewBox="0 0 120 120"
        className={`${iconClassName} -mb-[0.5mm]`.trim()}
        role="img"
        aria-label="PortFo logo mark"
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
      </svg>

      <span className={textClassName}>PortFo</span>
    </div>
  );
}
