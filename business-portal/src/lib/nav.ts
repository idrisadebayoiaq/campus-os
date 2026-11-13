export const PORTAL_NAV = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/apply", label: "Apply", icon: "assignments" },
  { href: "/listings", label: "Listings", icon: "market" },
  { href: "/listings/orders", label: "Orders", icon: "food" },
  { href: "/listings/inspections", label: "Inspections", icon: "housing" },
  { href: "/billing", label: "Billing", icon: "budget" },
  { href: "/admin", label: "Admin", icon: "profile" },
] as const;

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
    "Provider"
  );
}

export function usernameFromEmail(email?: string | null) {
  if (!email) return "provider";
  return email.split("@")[0]?.toLowerCase() || "provider";
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
