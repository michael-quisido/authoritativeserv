import type { RuleRow } from "@/lib/repo";

export function RealPage({ rule }: { rule: RuleRow }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Protected Destination</h1>
        <p className="mt-2 text-sm text-slate-600">
          You have a valid gate for{" "}
          <code className="rounded bg-slate-100 px-1">{rule.real_path}</code>.
        </p>
      </div>
    </main>
  );
}
