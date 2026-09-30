import type { ReactNode } from 'react'

// All icons are ported 1:1 from the design (stroke 1.75, square caps/joins,
// 24×24 viewBox — the design runtime injected the viewBox, a plain SVG needs
// it or the paths get clipped).
function I({ children, w = 1.75 }: { children: ReactNode; w?: number }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const Ic = {
  Refresh: () => (
    <I>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M8 16H3v5" />
    </I>
  ),
  Dots: () => (
    <I w={3}>
      <path d="M5 12h.01" />
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
    </I>
  ),
  Search: () => (
    <I>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </I>
  ),
  Sort: () => (
    <I>
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </I>
  ),
  Plus: () => (
    <I>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </I>
  ),
  X: () => (
    <I>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </I>
  ),
  Power: () => (
    <I>
      <path d="M12 2v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </I>
  ),
  Lock: () => (
    <I>
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </I>
  ),
  Rescue: () => (
    <I>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="m5.6 5.6 3.6 3.6" />
      <path d="m14.8 9.2 3.6-3.6" />
      <path d="m14.8 14.8 3.6 3.6" />
      <path d="m9.2 14.8-3.6 3.6" />
    </I>
  ),
  Disc: () => (
    <I>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
    </I>
  ),
  Globe: () => (
    <I>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a13 13 0 0 0 0 18 13 13 0 0 0 0-18" />
      <path d="M3 12h18" />
    </I>
  ),
  Box: () => (
    <I>
      <rect x="2" y="3" width="20" height="5" />
      <path d="M4 8v13h16V8" />
      <path d="M10 12h4" />
    </I>
  ),
  Shield: () => (
    <I>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </I>
  ),
  Chip: () => (
    <I>
      <rect x="5" y="5" width="14" height="14" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </I>
  ),
  Copy: () => (
    <I>
      <rect x="9" y="9" width="12" height="12" />
      <path d="M15 5V3H3v12h2" />
    </I>
  ),
  Warn: () => (
    <I>
      <path d="M12 3 2 21h20z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.01" />
    </I>
  ),
  Rotate: () => (
    <I>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </I>
  ),
  ChevronDown: () => (
    <I>
      <path d="m6 9 6 6 6-6" />
    </I>
  ),
  // graceful shutdown: a stop square in a circle (Power off keeps the power glyph)
  Stop: () => (
    <I>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" />
    </I>
  ),
  Play: () => (
    <I>
      <path d="M6 4v16l14-8z" />
    </I>
  ),
  Rescale: () => (
    <I>
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="m21 3-7 7" />
      <path d="m3 21 7-7" />
    </I>
  ),
  ChevronRight: () => (
    <I>
      <path d="m9 18 6-6-6-6" />
    </I>
  ),
  Layers: () => (
    <I>
      <path d="m12 2 10 5-10 5L2 7z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </I>
  ),
  Key: () => (
    <I>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </I>
  ),
  Camera: () => (
    <I>
      <path d="M14.5 4h-5L7 7H2v13h20V7h-5z" />
      <circle cx="12" cy="13" r="3" />
    </I>
  ),
  Trash: () => (
    <I>
      <path d="M3 6h18" />
      <path d="M19 6v15H5V6" />
      <path d="M8 6V3h8v3" />
    </I>
  ),
  Back: () => (
    <I>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </I>
  ),
  Eye: () => (
    <I>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" />
      <circle cx="12" cy="12" r="3" />
    </I>
  ),
  Check: () => (
    <I>
      <path d="M20 6 9 17l-5-5" />
    </I>
  ),
  SignOut: () => (
    <I>
      <path d="M9 21H4V3h5" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </I>
  ),
  Telegram: () => (
    <I>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </I>
  ),
  Sun: () => (
    <I>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </I>
  ),
  Moon: () => (
    <I>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </I>
  ),
}
