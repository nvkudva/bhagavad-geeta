import type React from "react";

/** The app mark: five book pages fanned into lotus petals over a spine curve.
 *  Stroke-only and id'd so it can be animated (draw-on, staggered fan) later. */
export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="6 16 52 45"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <defs>
      <path id="logo-page" d="M32 50C26 42 26 30 32 20c6 10 6 22 0 30Z" />
    </defs>
    <g id="logo-fan">
      <use href="#logo-page" transform="rotate(-50 32 50)" />
      <use href="#logo-page" transform="rotate(-25 32 50)" />
      <use href="#logo-page" />
      <use href="#logo-page" transform="rotate(25 32 50)" />
      <use href="#logo-page" transform="rotate(50 32 50)" />
    </g>
    <path id="logo-book" d="M13 56c6-3 13-3 19 1 6-4 13-4 19-1" />
  </svg>
);
