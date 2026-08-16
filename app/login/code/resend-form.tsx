"use client";

import { useActionState } from "react";
import { resendCode, type FormState } from "@/app/actions/auth";

export function ResendForm({ csrf }: { csrf: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resendCode, { errors: [] });
  return (
    <form action={action} className="space-y-2">
      {csrf !== null && <input type="hidden" name="csrf" value={csrf} />}
      {state.message && <p className="text-sm text-green-600">{state.message}</p>}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-red-600">
          {e}
        </p>
      ))}
      <button type="submit" disabled={pending} className="text-sm text-slate-600 underline disabled:opacity-50">
        {pending ? "Sending…" : "Resend code"}
      </button>
    </form>
  );
}
