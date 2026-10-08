/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from "firebase/auth";
import type { Session } from "@supabase/supabase-js";
import firebaseConfig from "../../firebase-applet-config.json";
import { supabase } from "./supabaseClient";

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
];

const provider = new GoogleAuthProvider();
GOOGLE_WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: "consent",
});

/** The parts of a Google account the UI shows. A Firebase User has the same fields. */
export type GoogleUser = Pick<User, "displayName" | "email" | "photoURL">;

let isSigningIn = false;
let cachedAccessToken: string | null = null;

/**
 * The app's Google SSO (Supabase) asks for the Drive and Docs scopes too, so its Google access
 * token works for Drive and Docs. Supabase only hands that token over once, right after sign-in,
 * so it is kept in sessionStorage for this tab until it expires. After that, the user connects
 * again with the Firebase popup below.
 */
const SSO_TOKEN_KEY = "kickstart.googleSsoToken";
// Google access tokens last an hour; stop using them a little early
const SSO_TOKEN_LIFETIME_MS = 55 * 60 * 1000;

type SsoToken = { accessToken: string; expiresAt: number; user: GoogleUser };

const ssoTokenListeners = new Set<() => void>();

function readSsoToken(): SsoToken | null {
  try {
    const raw = sessionStorage.getItem(SSO_TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as SsoToken;
    return token.expiresAt > Date.now() ? token : null;
  } catch {
    return null;
  }
}

function writeSsoToken(token: SsoToken | null) {
  try {
    if (token) sessionStorage.setItem(SSO_TOKEN_KEY, JSON.stringify(token));
    else sessionStorage.removeItem(SSO_TOKEN_KEY);
  } catch {
    // Storage blocked: the token is lost on reload and the user connects with the popup
  }
  ssoTokenListeners.forEach((listener) => listener());
}

function ssoTokenFromSession(session: Session): SsoToken | null {
  if (!session.provider_token) return null;
  const metadata = session.user.user_metadata ?? {};
  return {
    accessToken: session.provider_token,
    expiresAt: Date.now() + SSO_TOKEN_LIFETIME_MS,
    user: {
      displayName: metadata.full_name ?? metadata.name ?? null,
      email: session.user.email ?? null,
      photoURL: metadata.avatar_url ?? metadata.picture ?? null,
    },
  };
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    writeSsoToken(null);
    return;
  }
  const token = session && ssoTokenFromSession(session);
  if (token) writeSsoToken(token);
});

/**
 * Reports the connected Google account: the SSO token if it is still valid, otherwise the
 * Firebase popup sign-in. In-memory token management following security best practices.
 */
export const initAuth = (
  onAuthSuccess?: (user: GoogleUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const reportSsoToken = (): boolean => {
    const ssoToken = readSsoToken();
    if (ssoToken && onAuthSuccess) onAuthSuccess(ssoToken.user, ssoToken.accessToken);
    return !!ssoToken;
  };

  const handleSsoTokenChange = () => {
    if (!reportSsoToken() && !auth.currentUser && onAuthFailure) onAuthFailure();
  };
  ssoTokenListeners.add(handleSsoTokenChange);

  const unsubscribeFirebase = onAuthStateChanged(auth, async (user: User | null) => {
    if (reportSsoToken()) return;
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });

  return () => {
    ssoTokenListeners.delete(handleSsoTokenChange);
    unsubscribeFirebase();
  };
};

/**
 * Trigger Google Sign In popup with Google Docs & Drive scopes
 */
export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get Google access token from authentication.");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Google sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Retrieve cached in-memory access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  return readSsoToken()?.accessToken ?? cachedAccessToken;
};

/**
 * Set cached access token in memory (for instance after initial sign-in)
 */
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

/**
 * Sign out and clear in-memory token cache
 */
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  writeSsoToken(null);
};
