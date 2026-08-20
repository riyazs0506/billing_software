/** Inline stroke icons — no icon-font dependency, themable via currentColor. */

const base = (props) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  className: props.className || 'h-5 w-5',
  'aria-hidden': 'true',
})

export const IconDashboard = (p) => (
  <svg {...base(p)}>
    <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z" />
  </svg>
)

export const IconBilling = (p) => (
  <svg {...base(p)}>
    <path d="M9 14l2 2 4-4" />
    <path d="M5 3h14a1 1 0 011 1v17l-3-2-3 2-3-2-3 2-3-2V4a1 1 0 011-1z" />
  </svg>
)

export const IconTables = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

export const IconMenuBook = (p) => (
  <svg {...base(p)}>
    <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z" />
    <path d="M12 6.5v13" />
  </svg>
)

export const IconInventory = (p) => (
  <svg {...base(p)}>
    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
)

export const IconDiscount = (p) => (
  <svg {...base(p)}>
    <path d="M9 15l6-6M9.5 9.5h.01M14.5 14.5h.01" />
    <path d="M20.6 12l-1.4-2.1.2-2.6-2.5-.6-1.3-2.2L13 5.6 10.7 4.5 9.4 6.7l-2.5.6.2 2.6L5.7 12l1.4 2.1-.2 2.6 2.5.6 1.3 2.2 2.6-1.1 2.3 1.1 1.3-2.2 2.5-.6-.2-2.6L20.6 12z" />
  </svg>
)

export const IconUsers = (p) => (
  <svg {...base(p)}>
    <path d="M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9.5" cy="7" r="4" />
    <path d="M22 20v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87" />
  </svg>
)

export const IconExpense = (p) => (
  <svg {...base(p)}>
    <path d="M12 2v20M17 5.5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
)

export const IconReports = (p) => (
  <svg {...base(p)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 3 3 5-7" />
  </svg>
)

export const IconSettings = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 00.33 1.76l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.76-.33 1.6 1.6 0 00-1 1.47V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1.05-1.46 1.6 1.6 0 00-1.76.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.6 1.6 0 00.33-1.76 1.6 1.6 0 00-1.47-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.46-1.05 1.6 1.6 0 00-.33-1.76l-.06-.06a2 2 0 112.83-2.83l.06.06a1.6 1.6 0 001.76.33H9a1.6 1.6 0 001-1.47V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.47 1.6 1.6 0 001.76-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.6 1.6 0 00-.33 1.76V9a1.6 1.6 0 001.47 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.47 1z" />
  </svg>
)

export const IconBackup = (p) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
)

export const IconLogout = (p) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
)

export const IconPlus = (p) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconMinus = (p) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
)

export const IconTrash = (p) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" />
  </svg>
)

export const IconEdit = (p) => (
  <svg {...base(p)}>
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const IconPrint = (p) => (
  <svg {...base(p)}>
    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <path d="M6 14h12v8H6z" />
  </svg>
)

export const IconSearch = (p) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
)

export const IconCheck = (p) => (
  <svg {...base(p)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export const IconX = (p) => (
  <svg {...base(p)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

export const IconAlert = (p) => (
  <svg {...base(p)}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const IconOffline = (p) => (
  <svg {...base(p)}>
    <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.9 15.9 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
  </svg>
)

export const IconWifi = (p) => (
  <svg {...base(p)}>
    <path d="M5 12.55a11 11 0 0114 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
  </svg>
)

export const IconKitchen = (p) => (
  <svg {...base(p)}>
    <path d="M8 2v7a3 3 0 006 0V2M11 2v20M17 2c1.7 1.5 2 4 2 6s-.3 3-2 3v11" />
  </svg>
)

export const IconCash = (p) => (
  <svg {...base(p)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
)

export const IconCard = (p) => (
  <svg {...base(p)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20M6 15h4" />
  </svg>
)

export const IconUpi = (p) => (
  <svg {...base(p)}>
    <path d="M7 3l10 9-10 9M13 3l4 9-4 9" />
  </svg>
)

export const IconChevronLeft = (p) => (
  <svg {...base(p)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const IconChevronRight = (p) => (
  <svg {...base(p)}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export const IconDownload = (p) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)

export const IconRefresh = (p) => (
  <svg {...base(p)}>
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
)

export const IconMerge = (p) => (
  <svg {...base(p)}>
    <path d="M6 3v6a6 6 0 006 6h6M18 9l3 3-3 3M6 21v-6" />
  </svg>
)

export const IconSplit = (p) => (
  <svg {...base(p)}>
    <path d="M6 3v4a4 4 0 004 4h4M6 21v-4a4 4 0 014-4h4M14 4l4 3-4 3M14 14l4 3-4 3" />
  </svg>
)

export const IconClock = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IconBurger = (p) => (
  <svg {...base(p)}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

export const IconLock = (p) => (
  <svg {...base(p)}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 118 0v3" />
  </svg>
)

export const IconReceipt = (p) => (
  <svg {...base(p)}>
    <path d="M6 2h12a1 1 0 011 1v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21V3a1 1 0 011-1z" />
    <path d="M9 7h6M9 11h6M9 15h4" />
  </svg>
)

export const IconUser = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
  </svg>
)
