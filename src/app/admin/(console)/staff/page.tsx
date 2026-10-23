import { requireStaffPage } from "@/server/admin/guard";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/admin/admin-context";
import { ResetLinkButton, StaffCreateForm, StaffRoleSelect } from "@/components/admin/forms";

export default async function StaffPage() {
  const { staff: me } = await requireStaffPage("staff:manage");
  const staff = await db.staffUser.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="Staff accounts" description="Only super admins can manage staff. You cannot change your own role, and one active super admin must always remain." />
      <Card className="mb-6">
        <CardHeader title="Add staff member" />
        <div className="p-4"><StaffCreateForm /></div>
      </Card>
      <Card className="mb-6">
        <Table>
          <thead><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <Td><span className="font-medium text-ink">{s.name}</span><div className="text-xs text-muted">{s.email}</div></Td>
                <Td><StaffRoleSelect id={s.id} role={s.role} disabled={s.id === me.id} /></Td>
                <Td>
                  {s.isActive ? <Badge tone="ok">active</Badge> : <Badge>disabled</Badge>}
                  {s.lockedUntil && s.lockedUntil > new Date() ? <Badge tone="bad">locked</Badge> : null}
                </Td>
                <Td>{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "never"}</Td>
                <Td>
                  {s.id !== me.id ? (
                    <span className="flex flex-wrap gap-2">
                      <ActionButton method="PATCH" path={`/api/admin/staff/${s.id}`} body={{ isActive: !s.isActive }} label={s.isActive ? "Disable" : "Enable"} confirm={s.isActive ? "Disable this account? Their sessions end immediately." : undefined} />
                      <ResetLinkButton id={s.id} />
                    </span>
                  ) : <span className="text-xs text-muted">you</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="What each role can do" />
        <ul className="divide-y divide-line text-sm">
          {Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => (
            <li key={role} className="px-4 py-2.5"><span className="font-medium">{ROLE_LABELS[role as keyof typeof ROLE_LABELS]}</span>: <span className="text-muted">{perms.join(", ")}</span></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
