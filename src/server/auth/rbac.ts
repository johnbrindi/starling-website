import type { StaffRole } from "@/generated/prisma/enums";

export const PERMISSIONS = [
  "dashboard:view",
  "packages:manage",
  "customers:view",
  "customers:revoke",
  "payments:view",
  "payments:reconcile",
  "network:view",
  "network:manage",
  "settings:manage",
  "staff:manage",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = ["dashboard:view", "customers:view", "payments:view", "network:view"];
const SUPPORT: Permission[] = [...VIEWER, "customers:revoke", "audit:view"];
const ADMIN: Permission[] = PERMISSIONS.filter((p) => p !== "staff:manage");

/** Deny-by-default: a role has only the permissions listed here. */
export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  VIEWER,
  SUPPORT,
  ADMIN,
  SUPER_ADMIN: PERMISSIONS,
};

export function can(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrator",
  SUPPORT: "Support",
  VIEWER: "Viewer",
};
