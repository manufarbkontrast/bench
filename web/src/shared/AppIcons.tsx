/**
 * The Bench mark and one icon per app, shared by the navigation strip and by each app's own
 * brand block so the same glyph identifies an app wherever you are.
 *
 * Stroke icons sit on the same 24 grid as CRM's Icons.tsx and take their colour from the text
 * around them. The Bench mark is filled and carries the one accent: a bench whose seat is one
 * orange segment and two grey ones, on legs that follow the text colour.
 */

interface IconProps {
  size?: number;
}

function Stroke({
  size = 18,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const BenchMark = ({ size = 20 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="2" y="6.5" width="6.67" height="4.8" fill="#ff5c00" />
    <rect x="8.67" y="6.5" width="6.66" height="4.8" fill="#6f7884" />
    <rect x="15.33" y="6.5" width="6.67" height="4.8" fill="#6f7884" />
    <rect x="4" y="11.3" width="2.7" height="7.2" fill="currentColor" />
    <rect x="17.3" y="11.3" width="2.7" height="7.2" fill="currentColor" />
  </svg>
);

export const IconHome = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.5V20h12V9.5" />
    <path d="M10 20v-5h4v5" />
  </Stroke>
);

/** A contact card, not the briefcase or the pair of people - those name pages inside the CRM. */
export const IconCrm = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <circle cx="8.5" cy="10.5" r="2.25" />
    <path d="M5.5 16.25a3 3 0 0 1 6 0" />
    <path d="M14.5 10h4M14.5 14h4" />
  </Stroke>
);

/** An open book: the vault is read here, not written. */
export const IconVault = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3 4.5h6a3 3 0 0 1 3 3v12.5a2 2 0 0 0-2-2H3z" />
    <path d="M21 4.5h-6a3 3 0 0 0-3 3v12.5a2 2 0 0 1 2-2h7z" />
  </Stroke>
);

/** A rolodex card, notched where the spindle passes through it - the thing itself, rather
    than another address book that would look like the CRM's contact card. */
export const IconRolodex = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4.5 19.5V8.5h4.6q2.9 3.7 5.8 0h4.6v11" />
    <path d="M2.5 19.5h19" />
    <path d="M8.5 13h7M8.5 16.2h4.5" />
  </Stroke>
);

/** Two checkouts of unequal size: repositories and working folders side by side. */
export const IconProjekte = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 4h6v10H4z" />
    <path d="M14 4h6v6h-6z" />
    <path d="M14 14h6v6h-6z" />
    <path d="M4 18h6" />
  </Stroke>
);

export const IconSun = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Stroke>
);

export const IconMoon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" />
  </Stroke>
);
