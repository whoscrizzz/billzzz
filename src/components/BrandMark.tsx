interface BrandMarkProps {
  className?: string;
  /** 'color' fuerza el verde de marca (--brand); 'mono' hereda el color del contexto. */
  variant?: 'color' | 'mono';
}

/** Misma geometría que public/brand-mark.svg (icono 2b, "B de libro mayor") */
export function BrandMark({ className = 'brand-icon', variant = 'color' }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={variant === 'color' ? { color: 'var(--brand)' } : undefined}
      aria-hidden
    >
      <path
        d="M34 30h30a17 17 0 0 1 0 34H34z"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M34 64h34a18 18 0 0 1 0 36H34z"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M34 20v80" stroke="currentColor" strokeWidth={11} strokeLinecap="round" />
      <circle cx={88} cy={24} r={7} fill="currentColor" opacity={0.55} />
    </svg>
  );
}
