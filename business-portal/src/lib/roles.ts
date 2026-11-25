export type PortalRole =
  | "student"
  | "provider"
  | "vendor"
  | "moderator"
  | "admin"
  | "lecturer"
  | "school_admin";

export function isStaff(roles: string[]) {
  return roles.includes("admin") || roles.includes("moderator");
}

export function isLecturer(roles: string[]) {
  return roles.includes("lecturer");
}

export function isSchoolAdmin(roles: string[]) {
  return roles.includes("school_admin");
}

export function isBusiness(roles: string[]) {
  return roles.includes("provider") || roles.includes("vendor");
}
