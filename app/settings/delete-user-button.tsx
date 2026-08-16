"use client";

import { useActionState } from "react";
import { deleteUserAction, type SettingsState } from "@/app/actions/settings";

export function DeleteUserButton({ csrf, userId }: { csrf: string | null; userId: number }) {
  const [, action] = useActionState<SettingsState, FormData>(deleteUserAction, { errors: [] });
  return (
    <form action={action} className="inline">
      <input type="hidden" name="csrf" value={csrf ?? ""} />
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="text-sm text-red-600 underline">
        Delete
      </button>
    </form>
  );
}
