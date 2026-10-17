import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconGauge = (p: P) => (
  <Svg {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 14l4-3.5" />
    <circle cx="12" cy="14.5" r="1.4" />
  </Svg>
);

export const IconBox = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 20 7v10l-8 3.5L4 17V7l8-3.5Z" />
    <path d="M4 7l8 3.5L20 7" />
    <path d="M12 10.5V20" />
  </Svg>
);

export const IconReceipt = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5h12v17l-3-1.7-3 1.7-3-1.7-3 1.7v-17Z" />
    <path d="M9.5 8.5h5M9.5 12.5h5" />
  </Svg>
);

export const IconWallet = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 8.5A3 3 0 0 1 6.5 5.5h11a2 2 0 0 1 2 2v1" />
    <path d="M3.5 8.5v8a2.5 2.5 0 0 0 2.5 2.5h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-13" />
    <circle cx="16.5" cy="13.5" r="1.2" />
  </Svg>
);

export const IconClipboard = (p: P) => (
  <Svg {...p}>
    <path d="M9 4.5h6V3H9v1.5Z" />
    <path d="M15 4.5h2.5A1.5 1.5 0 0 1 19 6v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V6a1.5 1.5 0 0 1 1.5-1.5H9" />
    <path d="M8.5 11h7M8.5 15h4.5" />
  </Svg>
);

export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M6.5 20v-6M12 20V6M17.5 20v-9" />
  </Svg>
);

export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6" />
    <path d="M17.5 14.4A5.5 5.5 0 0 1 21 19.6" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);

export const IconMinus = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 12h13" />
  </Svg>
);

export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9.5 5.5 7 6.5-7 6.5" />
  </Svg>
);

export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m5.5 9.5 6.5 7 6.5-7" />
  </Svg>
);

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L18 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </Svg>
);

export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 19.5h4l11-11a2.1 2.1 0 0 0-3-3l-11 11v3Z" />
    <path d="m14.5 6.5 3 3" />
  </Svg>
);

export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 4.5 21 19H3l9-14.5Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 11.5A8 8 0 0 0 6.3 6.8L4 9" />
    <path d="M4 4.5V9h4.5" />
    <path d="M4 12.5A8 8 0 0 0 17.7 17.2L20 15" />
    <path d="M20 19.5V15h-4.5" />
  </Svg>
);

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v10" />
    <path d="m8 10.5 4 4 4-4" />
    <path d="M4.5 18.5h15" />
  </Svg>
);

export const IconTruck = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 7h9v9h-9z" />
    <path d="M12.5 10h4l3 3v3h-7z" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="16.5" cy="18" r="1.8" />
  </Svg>
);

export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 4.5h-8A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2h8" />
    <path d="M17 8.5 20.5 12 17 15.5" />
    <path d="M20 12h-9.5" />
  </Svg>
);

export const IconFilter = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15l-5.5 7v5l-4-2v-3l-5.5-7Z" />
  </Svg>
);

export const IconArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5" />
    <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
  </Svg>
);

export const IconArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="m6.5 13.5 5.5 5.5 5.5-5.5" />
  </Svg>
);

export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Svg>
);

export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="m12 3.5 8 4-8 4-8-4 8-4Z" />
    <path d="m4 12.5 8 4 8-4" />
    <path d="m4 16.5 8 4 8-4" />
  </Svg>
);

export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M4.9 7.5l1.8 1M17.3 15.5l1.8 1M4.9 16.5l1.8-1M17.3 8.5l1.8-1" />
  </Svg>
);

export const IconPackageCheck = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 19.5 7v6.2" />
    <path d="M4.5 7v10l7.5 3.3 3-1.4" />
    <path d="m4.5 7 7.5 3.5L19.5 7" />
    <path d="m15 17.5 1.8 1.8 3.4-3.6" />
  </Svg>
);

export const IconSpark = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 16.9l-1.8-4.9-4.9-1.8 4.9-1.8L12 3.5Z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
  </Svg>
);

export const IconCard = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2.4" />
    <path d="M3 10h18M6.5 14.5h3" />
  </Svg>
);

export const IconCash = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M6 12h.5M17.5 12H18" />
  </Svg>
);

export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconPhone = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 3.5h9v17h-9z" />
    <path d="M10.5 17.5h3" />
  </Svg>
);
