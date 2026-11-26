export function NavIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "support":
      return (
        <svg {...common}>
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2z" />
          <path d="M20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2z" />
          <path d="M17 18v1a2 2 0 0 1-2 2h-3" />
        </svg>
      );
    case "tickets":
      return (
        <svg {...common}>
          <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8z" />
          <path d="M9 6v12" strokeDasharray="2 2" />
        </svg>
      );
    case "study":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "housing":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
        </svg>
      );
    case "food":
      return (
        <svg {...common}>
          <path d="M8 3v8" />
          <path d="M8 11c0 4 0 7-2 10" />
          <path d="M6 3v4" />
          <path d="M10 3v4" />
          <path d="M16 3v18" />
          <path d="M16 8c2.5 0 4 1.5 4 4s-1.5 4-4 4" />
        </svg>
      );
    case "market":
      return (
        <svg {...common}>
          <path d="M6 7h12l-1 12H7L6 7z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M4 6h16v12H4z" />
          <path d="m4 8 8 5 8-5" />
        </svg>
      );
    case "guides":
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12c.8.8 1.2 1.7 1.2 2.8V18h5.6v-1.2c0-1.1.4-2 1.2-2.8A7 7 0 0 0 12 2z" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "panel":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </svg>
      );
    case "sun":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="m5 12 14-7-4 14-4-5-6-2z" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
        </svg>
      );
    case "courses":
      return (
        <svg {...common}>
          <path d="M4 5h16v14H4z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "timetable":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "assignments":
      return (
        <svg {...common}>
          <path d="M9 5h10v16H5V9l4-4z" />
          <path d="M9 5v4H5M8 13h8M8 17h6" />
        </svg>
      );
    case "exams":
      return (
        <svg {...common}>
          <path d="M8 4h8l2 4v14H6V8l2-4z" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case "ai":
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
    case "groups":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 19a6 6 0 0 1 12 0M14 19a5 5 0 0 1 7 0" />
        </svg>
      );
    case "school":
      return (
        <svg {...common}>
          <path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5z" />
          <path d="M7 12v4.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V12" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "budget":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M12 14h.01" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
