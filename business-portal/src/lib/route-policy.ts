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
  { prefix: "/listings/menu", allow: ["restaurant"] },
  { prefix: "/listings/deals", allow: ["restaurant"] },
  { prefix: "/listings/delivery", allow: ["restaurant"] },
  { prefix: "/listings/enquiries", allow: ["housing", "service", "seller"] },
  { prefix: "/team", allow: BUSINESS },
  { prefix: "/insights", allow: BUSINESS },
  { prefix: "/tenancies", allow: ["housing"] },
  { prefix: "/reviews", allow: BUSINESS },
  { prefix: "/boosts", allow: BUSINESS },
  { prefix: "/listings/market", allow: ["service", "seller"] },
  { prefix: "/listings", allow: BUSINESS },
  { prefix: "/billing", allow: BUSINESS },
  { prefix: "/plan", allow: BUSINESS },
  { prefix: "/payouts", allow: BUSINESS },
  { prefix: "/requests", allow: ["housing", "service"] },
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
