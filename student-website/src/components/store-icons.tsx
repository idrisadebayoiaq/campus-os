/** Official-style store / APK glyphs for download CTAs. */

export function PlayStoreIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M3.6 2.3c-.4.2-.6.6-.6 1.1v17.2c0 .5.2.9.6 1.1l9.4-9.7L3.6 2.3z"
      />
      <path
        fill="#FBBC04"
        d="M16.3 14.9 13 11.6 3.6 21.7c.2.1.4.2.6.2.3 0 .6-.1.9-.3l11.2-6.7z"
      />
      <path
        fill="#4285F4"
        d="M20.5 10.7 16.3 8.2 13 11.6l3.3 3.3 4.2-2.5c.7-.4.7-1.3 0-1.7z"
      />
      <path
        fill="#34A853"
        d="M13 11.6 16.3 8.2 5.1 1.5C4.8 1.3 4.5 1.2 4.2 1.2c-.2 0-.4.1-.6.2L13 11.6z"
      />
    </svg>
  );
}

export function AppStoreIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16.5 12.4c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.2-2.4-.1 0-2.1-.8-2.1-3.7zM14.3 6.3c.6-.7 1-1.7.9-2.7-0.9.1-1.9.6-2.5 1.3-.6.6-1.1 1.6-.9 2.5 1 .1 1.9-.5 2.5-1.1z"
      />
    </svg>
  );
}

export function ApkIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <rect x="8" y="6" width="32" height="36" rx="6" fill="#3DDC84" />
      <path
        fill="#FFFDF8"
        d="M18 18h12v2.5H18V18zm0 6h12v2.5H18V24zm0 6h8v2.5h-8V30z"
      />
      <circle cx="34" cy="34" r="9" fill="#3C315B" />
      <path
        fill="#FFFDF8"
        d="M34 29.2v7.2m0 0-2.6-2.6m2.6 2.6 2.6-2.6"
        stroke="#FFFDF8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
