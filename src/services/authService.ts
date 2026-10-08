/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { ALLOWED_EMAIL_DOMAIN } from "./allowedDomain";

export { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "./allowedDomain";

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      // `hd` makes Google's account picker show only accounts on this domain
      queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: "select_account" },
    },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/** fetch() for this app's /api routes, signed with the current user's session */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = await getSession();
  const headers = new Headers(init.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}
