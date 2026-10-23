import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission } from "../auth/rbac";
import { getStaff, type StaffContext } from "../auth/session";

/** Page-level guard for the admin console. Data APIs enforce permissions again independently. */
export async function requireStaffPage(permission: Permission): Promise<StaffContext> {
  const ctx = await getStaff();
  if (!ctx) redirect("/admin/login");
  if (!can(ctx.staff.role, permission)) redirect("/admin?denied=1");
  return ctx;
}
