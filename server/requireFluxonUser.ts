/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "../src/services/allowedDomain.ts";

let supabase: SupabaseClient | null = null;

/** Created on first use, because server.ts loads .env after its imports run */
function getSupabase(): SupabaseClient {
  if (supabase) return supabase;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env."
    );
  }
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

/** Rejects API requests that do not carry a valid Supabase session for an allowed Google account */
export async function requireFluxonUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Sign in to use this feature." });
    return;
  }

  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Your session has expired. Sign in again." });
    return;
  }
  if (!isAllowedEmail(data.user.email)) {
    res.status(403).json({ error: `Only @${ALLOWED_EMAIL_DOMAIN} accounts can use this app.` });
    return;
  }
  next();
}
