"use client";

import { useActionState } from "react";
import { deleteRuleAction, type SettingsState } from "@/app/actions/settings";

export function DeleteRuleButton({ csrf, ruleId }: { csrf: string | null; ruleId: number }) {
  const [, action] = useActionState<SettingsState, FormData>(deleteRuleAction, { errors: [] });
  return (
    <form action={action} className="inline">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      <input type="hidden" name="rule_id" value={ruleId} />
      <button type="submit" className="text-sm text-red-600 underline">
        Delete
      </button>
    </form>
  );
}
