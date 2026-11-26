import type { Persona } from "@/lib/persona";

const BUSINESS: Persona[] = ["housing", "restaurant", "service", "seller"];

/**
 * Which kinds of account may open which part of the portal.
 * First matching prefix wins, so keep the most specific ones first.
 */
const POLICY: { prefix: string; allow: Persona[] }[] = [
  { prefix: "/support-desk", allow: ["support", "admin"] },
  { prefix: "/admin", allow: ["admin"] },
  { prefix: "/school", allow: ["school", "admin"] },
  { prefix: "/classes", allow: ["lecturer"] },
  { prefix: "/announcements", allow: ["lecturer", "school"] },
  { prefix: "/listings/housing", allow: ["housing"] },
  { prefix: "/listings/inspections", allow: ["housing"] },
  { prefix: "/listings/food", allow: ["restaurant"] },
  { prefix: "/listings/orders", allow: ["restaurant"] },
  { prefix: "/listings/market", allow: ["service", "seller"] },
  { prefix: "/listings", allow: BUSINESS },
  { prefix: "/billing", allow: BUSINESS },
  { prefix: "/setup", allow: [...BUSINESS, "admin"] },
  { prefix: "/applications", allow: [...BUSINESS, "applicant", "admin"] },
  { prefix: "/apply/lecturer", allow: ["applicant", "lecturer"] },
  { prefix: "/apply", allow: ["applicant"] },
  { prefix: "/inbox", allow: [...BUSINESS, "lecturer", "school", "admin"] },
];

/** Returns the allowed personas for a path, or null when any signed-in user may open it. */
export function allowedPersonasFor(pathname: string): Persona[] | null {
  const hit = POLICY.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`),
  );
  return hit ? hit.allow : null;
}
