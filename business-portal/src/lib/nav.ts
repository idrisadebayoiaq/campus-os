export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
};

type RoleSet = {
  business: boolean;
  lecturer: boolean;
  school: boolean;
  staff: boolean;
};

function roleSet(roles: string[]): RoleSet {
  return {
    business: roles.includes("provider") || roles.includes("vendor"),
    lecturer: roles.includes("lecturer"),
    school: roles.includes("school_admin"),
    staff: roles.includes("admin") || roles.includes("moderator"),
  };
}

/** Sidebar navigation for the signed-in user's roles. */
export function navForRoles(roles: string[]): NavItem[] {
  const r = roleSet(roles);
  const items: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: "home", group: "Workspace" },
    { href: "/apply", label: "Apply", icon: "assignments", group: "Workspace" },
  ];

  if (r.business || r.staff) {
    items.push(
      { href: "/listings", label: "Listings", icon: "market", group: "Business" },
      { href: "/listings/orders", label: "Orders", icon: "food", group: "Business" },
      {
        href: "/listings/inspections",
        label: "Inspections",
        icon: "housing",
        group: "Business",
      },
      { href: "/billing", label: "Billing", icon: "budget", group: "Business" },
    );
  }

  if (r.lecturer || r.school || r.staff) {
    items.push(
      { href: "/classes", label: "Classes", icon: "courses", group: "Teaching" },
      {
        href: "/announcements",
        label: "Announcements",
        icon: "bell",
        group: "Teaching",
      },
    );
  }

  if (r.business || r.lecturer || r.school || r.staff) {
    items.push({ href: "/inbox", label: "Inbox", icon: "inbox", group: "Workspace" });
  }

  if (r.school || r.staff) {
    items.push(
      {
        href: "/school/verifications",
        label: "Verifications",
        icon: "shield",
        group: "School",
      },
      {
        href: "/school/departments",
        label: "Departments",
        icon: "school",
        group: "School",
      },
      {
        href: "/school/lecturers",
        label: "Lecturers",
        icon: "groups",
        group: "School",
      },
      {
        href: "/school/announcements",
        label: "School news",
        icon: "bell",
        group: "School",
      },
    );
  }

  if (r.staff) {
    items.push(
      { href: "/admin", label: "Admin", icon: "profile", group: "Staff" },
      { href: "/admin/schools", label: "Schools", icon: "school", group: "Staff" },
      { href: "/admin/lecturers", label: "Lecturer apps", icon: "groups", group: "Staff" },
    );
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

/** Quick links on the dashboard (everything except Home). */
export function dashboardLinks(roles: string[]) {
  return navForRoles(roles).filter((i) => i.href !== "/dashboard");
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
