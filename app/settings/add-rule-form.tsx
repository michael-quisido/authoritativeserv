"use client";

import { useActionState } from "react";
import { addRule, type SettingsState } from "@/app/actions/settings";

export function AddRuleForm({ csrf, users }: { csrf: string | null; users: Array<{ id: number; username: string }> }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addRule, { errors: [] });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      {state.message && <p className="w-full text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="w-full text-sm text-red-600">
          {e}
        </p>
      ))}
      <input name="dummy_path" placeholder="/dummy" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <input name="real_path" placeholder="/real" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
      <select name="user_id" required className="rounded border border-slate-300 px-3 py-2 text-sm">
        <option value="">User…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
        Add rule
      </button>
    </form>
  );
}
