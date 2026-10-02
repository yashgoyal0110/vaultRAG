// Lightweight inline icon set (stroke-based, inherits currentColor).
// No icon library dependency — keeps the bundle lean and the look consistent.
type P = { className?: string };
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const DocIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export const ChatIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z" />
  </svg>
);

export const UploadIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const ShieldIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const CheckIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base} strokeWidth={2.25}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const PlusIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TrashIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
);

export const LogoutIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const SparkIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

export const AlertIcon = ({ className = 'icon' }: P) => (
  <svg className={className} {...base}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);

// Brand mark (served from /favicon.svg)
export const Logo = ({ className = 'logo' }: P) => (
  <img src="/favicon.svg" alt="" className={className} aria-hidden="true" />
);
