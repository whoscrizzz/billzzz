interface BrandMarkProps {
  className?: string;
}

/** Misma geometría que public/brand-mark.svg (fondo transparente) */
const HOOK_PATH =
  'M176 308 C176 168, 256 108, 336 108 C404 108, 444 152, 444 212 C444 264, 400 300, 344 300 C304 300, 276 276, 268 248';

const CAPSULES = [
  { x: 132, y: 340, width: 248, height: 48, rx: 24, shineY: 344 },
  { x: 132, y: 404, width: 248, height: 48, rx: 24, shineY: 408 },
] as const;

function BrandDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-brand`} x1="34%" y1="8%" x2="66%" y2="92%">
        <stop offset="0%" stopColor="#52b788" />
        <stop offset="45%" stopColor="#2d6a4f" />
        <stop offset="100%" stopColor="#1b4332" />
      </linearGradient>
      <linearGradient id={`${id}-shine`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.38} />
        <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${id}-edge`} x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#1b4332" stopOpacity={0.25} />
        <stop offset="100%" stopColor="#1b4332" stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

export function BrandMark({ className = 'brand-icon' }: BrandMarkProps) {
  const id = 'bills-mark';

  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <BrandDefs id={id} />
      <path
        fill="none"
        stroke={`url(#${id}-brand)`}
        strokeWidth={56}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={HOOK_PATH}
      />
      {CAPSULES.map((c) => (
        <g key={c.y}>
          <rect
            x={c.x}
            y={c.y}
            width={c.width}
            height={c.height}
            rx={c.rx}
            fill={`url(#${id}-brand)`}
          />
          <rect
            x={c.x}
            y={c.y}
            width={c.width}
            height={c.height}
            rx={c.rx}
            fill={`url(#${id}-edge)`}
          />
          <rect
            x={c.x + 8}
            y={c.shineY}
            width={c.width - 16}
            height={16}
            rx={10}
            fill={`url(#${id}-shine)`}
          />
        </g>
      ))}
    </svg>
  );
}
