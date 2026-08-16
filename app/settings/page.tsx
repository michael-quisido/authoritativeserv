import { LogoutButton } from "./logout-button";

export default function SettingsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-4">
      <h1 className="text-xl font-semibold">Settings Dashboard</h1>
      <LogoutButton />
    </main>
  );
}
