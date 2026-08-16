"use client";

import { useActionState } from "react";
import { verifyAdminCode, type FormState } from "@/app/actions/auth";

export function CodeForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyAdminCode, { errors: [] });
  return (
    <form action={action} className="space-y-4">
      {csrf !== null && <input type="hidden" name="csrf" value={csrf} />}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          maxLength={8}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
