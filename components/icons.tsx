import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconCards = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="11" height="15" rx="2.2" transform="rotate(-8 9 12.5)" />
    <path d="M12.8 4.6l5.4.8a2.2 2.2 0 0 1 1.9 2.5l-1.6 11a2.2 2.2 0 0 1-2.5 1.9l-2.4-.4" />
    <path d="M8.6 11.2c.8-1.3 2.6-1 2.6.4 0 1.2-1.7 2.2-2.6 2.9-.9-.7-2.6-1.7-2.6-2.9 0-1.4 1.8-1.7 2.6-.4z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrophy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6" />
    <path d="M12 14v3.5M8.5 20.5h7M9.5 17.5h5" />
  </svg>
);

export const IconHistory = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 4.5V8H7" />
    <path d="M12 8v4.3l2.8 1.7" />
  </svg>
);

export const IconMore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
  </svg>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 18, height: 18, ...p })}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" />
  </svg>
);

export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPrev = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M18 6l-8 6 8 6V6z" fill="currentColor" />
    <path d="M6.5 6v12" />
  </svg>
);

export const IconNext = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l8 6-8 6V6z" fill="currentColor" />
    <path d="M17.5 6v12" />
  </svg>
);
