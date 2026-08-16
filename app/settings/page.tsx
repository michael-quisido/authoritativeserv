import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { listRules, listUsers } from "@/lib/repo";
import { AddUserForm } from "./add-user-form";
import { DeleteUserButton } from "./delete-user-button";
import { AddRuleForm } from "./add-rule-form";
import { DeleteRuleButton } from "./delete-rule-button";
import { ChangePasswordForm } from "./change-password-form";
import { LogoutButton } from "./logout-button";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session?.data.admin_verified) redirect("/login");
  const csrf = session.data.csrf ?? null;
  const [users, rules] = await Promise.all([listUsers(), listRules()]);
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">Settings Dashboard</h1>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Users</h2>
          <AddUserForm csrf={csrf} />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Username</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2">{u.username}</td>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2 text-right">
                    <DeleteUserButton csrf={csrf} userId={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Protected URL Rules</h2>
          <AddRuleForm csrf={csrf} users={users.map((u) => ({ id: u.id, username: u.username }))} />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Dummy path</th>
                <th>Real path</th>
                <th>User</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.dummy_path}</td>
                  <td className="py-2">{r.real_path}</td>
                  <td className="py-2">{r.username}</td>
                  <td className="py-2 text-right">
                    <DeleteRuleButton csrf={csrf} ruleId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Change Password</h2>
          <ChangePasswordForm csrf={csrf} />
        </section>
      </div>
    </main>
  );
}
