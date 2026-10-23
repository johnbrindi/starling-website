import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { getSettings } from "@/server/settings";
import { Card, PageHeader } from "@/components/ui/primitives";
import { SettingsForm } from "@/components/admin/forms";

export default async function SettingsPage() {
  const { staff } = await requireStaffPage("dashboard:view");
  const settings = await getSettings();
  const readOnly = !can(staff.role, "settings:manage");
  return (
    <>
      <PageHeader title="Settings" description={readOnly ? "Read only for your role." : "Operational settings. Secrets and router credentials live in server environment variables, not here."} />
      <Card className="p-4 sm:p-5">
        <SettingsForm initial={settings} readOnly={readOnly} />
      </Card>
    </>
  );
}
