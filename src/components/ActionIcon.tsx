export type ActionIconName =
  | 'check'
  | 'copy'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'shield'
  | 'calculator'
  | 'theme'
  | 'faceid'
  | 'bell'
  | 'trending-up';

interface ActionIconProps {
  name: ActionIconName;
  className?: string;
}

export function ActionIcon({ name, className = 'action-icon' }: ActionIconProps) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'check':
      return (
        <svg {...common}>
          <path d="M5 12.5 10 17.5 19 7.5" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case 'chevron-left':
      return (
        <svg {...common}>
          <path d="M14 6l-6 6 6 6" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...common}>
          <path d="M10 6l6 6-6 6" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'calculator':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
        </svg>
      );
    case 'theme':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
        </svg>
      );
    case 'faceid':
      return (
        <svg {...common}>
          <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
          <path d="M9 10v1.5M15 10v1.5" />
          <path d="M9.5 15.5c.7.6 1.6.9 2.5.9s1.8-.3 2.5-.9" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 10a6 6 0 1 1 12 0c0 3.2 1 5 1.8 6H4.2C5 15 6 13.2 6 10Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'trending-up':
      return (
        <svg {...common}>
          <path d="M4 16l6-6 4 4 6-8" />
          <path d="M20 6h-4M20 6v4" />
        </svg>
      );
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}
