/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Only Google accounts on this domain may use the app. Shared by the browser and the API server;
 * the database enforces the same domain in supabase/migrations/0002_fluxon_only_auth.sql.
 */
export const ALLOWED_EMAIL_DOMAIN = "fluxon.com";

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
