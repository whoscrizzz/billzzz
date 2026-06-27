interface BrandMarkProps {
  className?: string;
  /** Full square icon (black bg) or transparent mark for UI chips */
  variant?: "3d" | "flat";
  /** Show integrated $ inside the hook */
  withDollar?: boolean;
}

/** Geometry copied from public/brand-mark.svg */
const HOOK_PATH =
  "M176 308 C176 168, 256 108, 336 108 C404 108, 444 152, 444 212 C444 264, 400 300, 344 300 C304 300, 276 276, 268 248";

const CAPSULES = [
  { x: 132, y: 340, width: 248, height: 48, rx: 24 },
  { x: 132, y: 404, width: 248, height: 48, rx: 24 },
] as const;

/** $ curve + stem sized to sit inside the hook opening */
const DOLLAR_S =
  "M292 162 C262 162, 246 180, 246 200 C246 220, 266 230, 292 230 C318 230, 334 244, 334 264 C334 284, 312 294, 292 294 C272 294, 256 280, 256 270";
const DOLLAR_STEM = "M288 144 V 312";

function ThreeDDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#121318" />
        <stop offset="55%" stopColor="#050506" />
        <stop offset="100%" stopColor="#000000" />
      </linearGradient>
      <linearGradient id={`${id}-face`} x1="18%" y1="8%" x2="82%" y2="92%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="48%" stopColor="#eef1f6" />
        <stop offset="100%" stopColor="#b8bec8" />
      </linearGradient>
      <linearGradient id={`${id}-depth`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4a505a" />
        <stop offset="100%" stopColor="#1a1d24" />
      </linearGradient>
      <linearGradient id={`${id}-capsule-top`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#ffffff" floodOpacity="0.12" />
      </filter>
    </defs>
  );
}

function Hook({
  stroke,
  strokeWidth = 56,
  transform,
}: {
  stroke: string;
  strokeWidth?: number;
  transform?: string;
}) {
  return (
    <path
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      d={HOOK_PATH}
      transform={transform}
    />
  );
}

function Capsules({
  fill,
  transform,
  highlight = false,
  highlightFill,
}: {
  fill: string;
  transform?: string;
  highlight?: boolean;
  highlightFill?: string;
}) {
  return (
    <g transform={transform}>
      {CAPSULES.map((c) => (
        <g key={`${c.y}`}>
          <rect x={c.x} y={c.y} width={c.width} height={c.height} rx={c.rx} fill={fill} />
          {highlight && highlightFill ? (
            <rect
              x={c.x + 6}
              y={c.y + 4}
              width={c.width - 12}
              height={c.height * 0.42}
              rx={c.rx - 4}
              fill={highlightFill}
            />
          ) : null}
        </g>
      ))}
    </g>
  );
}

function DollarMark({ stroke, strokeWidth = 34 }: { stroke: string; strokeWidth?: number }) {
  return (
    <g opacity={0.92}>
      <path
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={DOLLAR_S}
      />
      <path
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth * 0.72}
        strokeLinecap="round"
        d={DOLLAR_STEM}
      />
    </g>
  );
}

export function BrandMark({
  className = "brand-icon",
  variant = "3d",
  withDollar = true,
}: BrandMarkProps) {
  const uid = "brand-mark";

  if (variant === "flat") {
    return (
      <svg
        className={className}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <Hook stroke="#ffffff" />
        <Capsules fill="#ffffff" />
        {withDollar ? <DollarMark stroke="#ffffff" strokeWidth={30} /> : null}
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ThreeDDefs id={uid} />
      <Hook stroke={`url(#${uid}-depth)`} transform="translate(9 11)" />
      <Capsules fill={`url(#${uid}-depth)`} transform="translate(9 11)" />
      {withDollar ? (
        <g transform="translate(9 11)">
          <DollarMark stroke={`url(#${uid}-depth)`} strokeWidth={34} />
        </g>
      ) : null}
      <g filter={`url(#${uid}-glow)`}>
        <Hook stroke={`url(#${uid}-face)`} />
        {withDollar ? <DollarMark stroke={`url(#${uid}-face)`} strokeWidth={32} /> : null}
        <Capsules
          fill={`url(#${uid}-face)`}
          highlight
          highlightFill={`url(#${uid}-capsule-top)`}
        />
      </g>
    </svg>
  );
}

/** Full-bleed app icon: black canvas + 3D mark (matches brand-mark-3d.svg) */
export function BrandMarkAppIcon({ className }: { className?: string }) {
  const uid = "brand-app";

  return (
    <svg
      className={className}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Bills"
    >
      <ThreeDDefs id={uid} />
      <rect width="512" height="512" fill={`url(#${uid}-bg)`} />
      <Hook stroke={`url(#${uid}-depth)`} transform="translate(9 11)" />
      <Capsules fill={`url(#${uid}-depth)`} transform="translate(9 11)" />
      <g transform="translate(9 11)">
        <DollarMark stroke={`url(#${uid}-depth)`} strokeWidth={34} />
      </g>
      <g filter={`url(#${uid}-glow)`}>
        <Hook stroke={`url(#${uid}-face)`} />
        <DollarMark stroke={`url(#${uid}-face)`} strokeWidth={32} />
        <Capsules
          fill={`url(#${uid}-face)`}
          highlight
          highlightFill={`url(#${uid}-capsule-top)`}
        />
      </g>
    </svg>
  );
}
