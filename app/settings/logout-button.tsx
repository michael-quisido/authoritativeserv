"use client";

import { logout } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
      >
        Logout
      </button>
    </form>
  );
}
