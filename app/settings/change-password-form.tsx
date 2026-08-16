"use client";

import { useActionState } from "react";
import { changePassword, type SettingsState } from "@/app/actions/settings";

export function ChangePasswordForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePassword, { errors: [] });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="current_password">
          Current password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="new_password">
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        Change password
      </button>
    </form>
  );
}
