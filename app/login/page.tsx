import { getCurrentSession } from "@/lib/session-cookie";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentSession();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Admin Login</h1>
        <LoginForm csrf={session?.data.csrf ?? null} />
      </div>
    </main>
  );
}
