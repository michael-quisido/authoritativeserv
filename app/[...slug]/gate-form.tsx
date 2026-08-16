"use client";

import { useActionState } from "react";
import { gateSendCode, gateVerify, type GateState } from "@/app/actions/gate";

export function GateForm({ ruleId, csrf }: { ruleId: number; csrf: string | null }) {
  const [sendState, sendAction, sendPending] = useActionState<GateState, FormData>(gateSendCode, { errors: [] });
  const [verifyState, verifyAction, verifyPending] = useActionState<GateState, FormData>(gateVerify, { errors: [] });
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">Restricted Area</h1>
        <p className="mb-4 text-sm text-slate-600">
          This URL is protected. Enter the 8-character code emailed to you.
        </p>
        <form action={sendAction} className="mb-4">
          <input type="hidden" name="csrf" value={csrf ?? ""} />
          <input type="hidden" name="rule_id" value={ruleId} />
          {sendState.message && <p className="text-sm text-green-600">{sendState.message}</p>}
          {sendState.errors.map((e) => (
            <p key={e} className="text-sm text-red-600">
              {e}
            </p>
          ))}
          <button
            type="submit"
            disabled={sendPending}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {sendPending ? "Sending…" : "Send me a code"}
          </button>
        </form>
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="csrf" value={csrf ?? ""} />
          <input type="hidden" name="rule_id" value={ruleId} />
          {verifyState.errors.map((e) => (
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
            disabled={verifyPending}
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {verifyPending ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </main>
  );
}
