import "server-only";
import type { NextRequest } from "next/server";
import type { Permission } from "../auth/rbac";
import { assertStaffCsrf, requireStaff, type StaffContext } from "../auth/session";
import { assertSameOrigin, clientIp, handler } from "../http";

/**
 * Wraps an admin route handler. Every admin endpoint is: authenticated, permission-checked
 * (deny by default), and for state-changing methods, origin + CSRF-token checked.
 */
export function staffRoute<C>(permission: Permission, fn: (req: NextRequest, staff: StaffContext & { ip: string }, ctx: C) => Promise<Response>) {
  return handler<C>(async (req, ctx) => {
    const staff = await requireStaff(permission);
    if (req.method !== "GET" && req.method !== "HEAD") {
      assertSameOrigin(req);
      assertStaffCsrf(req, staff);
    }
    return fn(req, { ...staff, ip: clientIp(req) }, ctx);
  });
}
