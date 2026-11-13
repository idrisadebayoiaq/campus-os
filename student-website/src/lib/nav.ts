export const STUDENT_NAV = [
  { href: "/study", label: "Study", icon: "study" },
  { href: "/housing", label: "Housing", icon: "housing" },
  { href: "/food", label: "Food", icon: "food" },
  { href: "/marketplace", label: "Marketplace", icon: "market" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/guides", label: "Guides", icon: "guides" },
  { href: "/profile", label: "Profile & settings", icon: "profile" },
  { href: "/download", label: "Download", icon: "download" },
] as const;

export type StudentNavItem = (typeof STUDENT_NAV)[number];

export function displayNameFromProfile(input: {
  preferred_name?: string | null;
  first_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}) {
  return (
    input.preferred_name ||
    input.first_name ||
    input.full_name ||
    input.email?.split("@")[0] ||
    "Student"
  );
}

export function usernameFromEmail(email?: string | null) {
  if (!email) return "student";
  return email.split("@")[0]?.toLowerCase() || "student";
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
