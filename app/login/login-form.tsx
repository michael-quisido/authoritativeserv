"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions/auth";

export function LoginForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, { errors: [] });
  return (
    <form action={action} className="space-y-4">
      {csrf !== null && <input type="hidden" name="csrf" value={csrf} />}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
