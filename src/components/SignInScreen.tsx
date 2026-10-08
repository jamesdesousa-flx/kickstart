/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ALLOWED_EMAIL_DOMAIN, signInWithGoogle } from "../services/authService";

interface SignInScreenProps {
  error?: string | null;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ error }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsRedirecting(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setSignInError(err?.message || "Could not start Google sign in.");
      setIsRedirecting(false);
    }
  };

  const shownError = signInError || error;

  return (
    <div className="min-h-screen w-screen bg-slate-50 font-sans text-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Kickstart</h1>
        <p className="text-xs text-slate-500 mt-1 mb-6">Sign in with your @{ALLOWED_EMAIL_DOMAIN} Google account.</p>

        {shownError && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{shownError}</span>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={isRedirecting}
          className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
        >
          {isRedirecting && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in with Google
        </button>
      </div>
    </div>
  );
};
