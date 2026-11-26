/**
 * Who is this portal user?  One account = one kind of account.
 * Pure helpers (no server imports) so the nav, dashboard, middleware and pages
 * all decide access the same way.
 */

export type Persona =
  | "housing"
  | "restaurant"
  | "service"
  | "seller"
  | "lecturer"
  | "school"
  | "admin"
  | "applicant";

export type AccessInfo = {
  roles: string[];
  /** business_type of every approved business profile the user owns */
  businessTypes: string[];
  /** business_type of applications still in progress (draft/submitted/…) */
  pendingTypes: string[];
};

export const BUSINESS_PERSONAS: Persona[] = ["housing", "restaurant", "service", "seller"];

const TYPE_TO_PERSONA: Record<string, Persona> = {
  housing_provider: "housing",
  food_vendor: "restaurant",
  campus_service: "service",
  marketplace_seller: "seller",
};

export const PERSONA_LABEL: Record<Persona, string> = {
  housing: "Housing agent",
  restaurant: "Restaurant",
  service: "Campus service",
  seller: "Marketplace seller",
  lecturer: "Lecturer",
  school: "School authority",
  admin: "Admin",
  applicant: "New account",
};

export function personasFor(info: AccessInfo): Persona[] {
  const out: Persona[] = [];
  if (info.roles.includes("admin") || info.roles.includes("moderator")) out.push("admin");
  for (const type of info.businessTypes) {
    const p = TYPE_TO_PERSONA[type];
    if (p && !out.includes(p)) out.push(p);
  }
  if (info.roles.includes("school_admin")) out.push("school");
  if (info.roles.includes("lecturer")) out.push("lecturer");
  if (!out.length) out.push("applicant");
  return out;
}

export function isBusinessPersona(p: Persona) {
  return BUSINESS_PERSONAS.includes(p);
}

export function hasBusiness(personas: Persona[]) {
  return personas.some(isBusinessPersona);
}

/** Staff with no other kind of account get the admin-only experience. */
export function isAdminOnly(personas: Persona[]) {
  return personas.includes("admin") && personas.every((p) => p === "admin" || p === "applicant");
}

export function homeFor(personas: Persona[]) {
  return isAdminOnly(personas) ? "/admin" : "/dashboard";
}

/** Business type key an applicant is currently applying as (if any). */
export function pendingBusinessPersonas(info: AccessInfo): Persona[] {
  return info.pendingTypes
    .map((t) => TYPE_TO_PERSONA[t])
    .filter((p): p is Persona => Boolean(p));
}
