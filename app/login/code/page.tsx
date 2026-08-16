import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { CodeForm } from "./code-form";
import { ResendForm } from "./resend-form";

export default async function CodePage() {
  const session = await getCurrentSession();
  if (!session || !session.data.admin_pw_ok) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Verify Code</h1>
        <p className="mb-4 text-sm text-slate-600">
          Enter the 8-character code sent to your email.
        </p>
        <CodeForm csrf={session.data.csrf ?? null} />
        <div className="mt-4 border-t pt-4">
          <ResendForm csrf={session.data.csrf ?? null} />
        </div>
      </div>
    </main>
  );
}
