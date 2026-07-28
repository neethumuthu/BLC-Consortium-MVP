"use server";

import { redirect } from "next/navigation";
// COSMETIC LOGIN ONLY - see the comment atop lib/institutions.ts. This
// checks submitted credentials against a hardcoded, non-secret list -
// there is no real user store or password hashing here, by design.
import { findByCredentials } from "@/lib/institutions";
import { setSession, clearSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const account = findByCredentials(email, password);
  if (!account) {
    return { error: "Invalid email or password." };
  }

  await setSession(account.institutionId);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
