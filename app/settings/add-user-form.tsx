"use client";

import { useActionState } from "react";
import { addUser, type SettingsState } from "@/app/actions/settings";

export function AddUserForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addUser, { errors: [] });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      {state.message && <p className="w-full text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="w-full text-sm text-red-600">
          {e}
        </p>
      ))}
      <input name="username" placeholder="Username" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <input name="password" type="password" placeholder="Password" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <input name="email" type="email" placeholder="Email" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        Add user
      </button>
    </form>
  );
}
