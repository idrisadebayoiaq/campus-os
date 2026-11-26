import { isAdminOnly, isSupportOnly, type Persona } from "@/lib/persona";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
};

const HOME: NavItem = { href: "/dashboard", label: "Overview", icon: "home", group: "Workspace" };
const MESSAGES: NavItem = { href: "/inbox", label: "Messages", icon: "inbox", group: "Workspace" };
const BILLING: NavItem = { href: "/billing", label: "Billing", icon: "budget", group: "Workspace" };
const HELP: NavItem = { href: "/support", label: "Help & support", icon: "support", group: "Help" };

const DESK_NAV: NavItem[] = [
  { href: "/support-desk", label: "Tickets", icon: "tickets", group: "Support desk" },
  { href: "/support-desk/knowledge", label: "Assistant knowledge", icon: "guides", group: "Support desk" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "home", group: "Admin" },
  { href: "/admin/users", label: "Users & roles", icon: "profile", group: "Admin" },
  { href: "/admin/applications", label: "Businesses", icon: "assignments", group: "Reviews" },
  { href: "/admin/lecturers", label: "Lecturers", icon: "groups", group: "Reviews" },
  { href: "/school/verifications", label: "Student IDs", icon: "shield", group: "Reviews" },
  { href: "/admin/listings", label: "Listings", icon: "market", group: "Moderation" },
  { href: "/admin/reports", label: "Reports", icon: "bell", group: "Moderation" },
  { href: "/admin/schools", label: "Schools", icon: "school", group: "Platform" },
  { href: "/inbox", label: "Inbox", icon: "inbox", group: "Platform" },
  ...DESK_NAV,
  { href: "/admin/support-team", label: "Support team", icon: "groups", group: "Support desk" },
];

const NAV_BY_PERSONA: Record<Exclude<Persona, "admin">, NavItem[]> = {
  housing: [
    HOME,
    { href: "/listings", label: "Properties", icon: "housing", group: "Housing" },
    { href: "/listings/inspections", label: "Inspections", icon: "timetable", group: "Housing" },
    MESSAGES,
    BILLING,
    HELP,
  ],
  restaurant: [
    HOME,
    { href: "/listings", label: "Menu", icon: "food", group: "Restaurant" },
    { href: "/listings/orders", label: "Orders", icon: "assignments", group: "Restaurant" },
    MESSAGES,
    BILLING,
    HELP,
  ],
  service: [
    HOME,
    { href: "/listings", label: "My listings", icon: "market", group: "Services" },
    MESSAGES,
    BILLING,
    HELP,
  ],
  seller: [
    HOME,
    { href: "/listings", label: "My listings", icon: "market", group: "Marketplace" },
    MESSAGES,
    BILLING,
    HELP,
  ],
  lecturer: [
    HOME,
    { href: "/classes", label: "Classes", icon: "courses", group: "Teaching" },
    { href: "/announcements", label: "Announcements", icon: "bell", group: "Teaching" },
    MESSAGES,
    HELP,
  ],
  school: [
    HOME,
    { href: "/school/verifications", label: "Student IDs", icon: "shield", group: "School" },
    { href: "/school/departments", label: "Departments", icon: "school", group: "School" },
    { href: "/school/lecturers", label: "Lecturers", icon: "groups", group: "School" },
    { href: "/school/announcements", label: "School news", icon: "bell", group: "School" },
    MESSAGES,
    HELP,
  ],
  support: DESK_NAV,
  applicant: [
    HOME,
    { href: "/apply", label: "Apply", icon: "assignments", group: "Workspace" },
    HELP,
  ],
};

/** Sidebar for the account's kind(s). Only that kind's own tools appear. */
export function navForPersonas(personas: Persona[]): NavItem[] {
  if (isSupportOnly(personas)) return DESK_NAV;
  if (isAdminOnly(personas)) return ADMIN_NAV;

  const items: NavItem[] = [];
  const seen = new Set<string>();
  for (const persona of personas) {
    if (persona === "admin") continue;
    for (const item of NAV_BY_PERSONA[persona]) {
      const key = `${item.href}|${item.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  if (personas.includes("admin")) {
    for (const item of ADMIN_NAV) {
      const key = `${item.href}|${item.label}`;
      if (!seen.has(key)) items.push(item);
    }
  }
  return items;
}

export function groupNav(items: NavItem[]) {
  const order: string[] = [];
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!map.has(item.group)) {
      map.set(item.group, []);
      order.push(item.group);
    }
    map.get(item.group)!.push(item);
  }
  return order.map((group) => ({ group, items: map.get(group)! }));
}

/** Quick links on the dashboard (everything except Overview). */
export function dashboardLinks(personas: Persona[]) {
  return navForPersonas(personas).filter(
    (i) => i.href !== "/dashboard" && i.href !== "/admin" && i.href !== "/support",
  );
}

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
