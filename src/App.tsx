/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CanvasEdge, CanvasNode } from "./types/artefacts";
import { Project, getProject, loadProjectCanvas } from "./services/projectsService";
import { setActiveProjectFigjamBoard } from "./services/figjamMcpService";
import { ProjectsHome } from "./components/ProjectsHome";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { SignInScreen } from "./components/SignInScreen";
import {
  ALLOWED_EMAIL_DOMAIN,
  getSession,
  isAllowedEmail,
  onSessionChange,
  signOut,
} from "./services/authService";

type OpenProject = {
  project: Project;
  canvas: { nodes: CanvasNode[]; edges: CanvasEdge[] };
};

/** The open project lives in the URL hash (#/projects/<id>) so reloads and back/forward keep it */
function projectIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/projects\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

/** Shows the sign-in screen until someone with an allowed Google account is signed in */
export default function App() {
  // undefined while the stored session is still being read
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const applySession = (email: string | null) => {
      if (email && !isAllowedEmail(email)) {
        setAuthError(`${email} is not allowed. Sign in with your @${ALLOWED_EMAIL_DOMAIN} account.`);
        setUserEmail(null);
        signOut();
        return;
      }
      setUserEmail(email);
    };
    getSession()
      .then((session) => applySession(session?.user.email ?? null))
      .catch(() => applySession(null));
    return onSessionChange((session) => applySession(session?.user.email ?? null));
  }, []);

  if (userEmail === undefined) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!userEmail) {
    return <SignInScreen error={authError} />;
  }
  return <SignedInApp userEmail={userEmail} />;
}

function SignedInApp({ userEmail }: { userEmail: string }) {
  const [routeProjectId, setRouteProjectId] = useState<string | null>(projectIdFromHash);
  const [openProject, setOpenProject] = useState<OpenProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => setRouteProjectId(projectIdFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!routeProjectId) {
      setOpenProject(null);
      setActiveProjectFigjamBoard("");
      return;
    }
    if (openProject?.project.id === routeProjectId) return;

    let cancelled = false;
    setOpenProject(null);
    setLoadError(null);
    (async () => {
      try {
        const project = await getProject(routeProjectId);
        if (!project) throw new Error("This project does not exist or you do not have access to it.");
        const canvas = await loadProjectCanvas(project.id);
        if (cancelled) return;
        setActiveProjectFigjamBoard(project.figjamFileKey);
        setOpenProject({ project, canvas });
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Could not open the project.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeProjectId]);

  const navigateTo = useCallback((projectId: string | null) => {
    window.location.hash = projectId ? `/projects/${projectId}` : "";
  }, []);

  if (!routeProjectId) {
    return <ProjectsHome
        userEmail={userEmail}
        onSignOut={signOut}
        onOpenProject={(project) => navigateTo(project.id)}
      />;
  }

  if (!openProject) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 font-sans text-sm text-slate-600">
        {loadError ? (
          <>
            <p className="text-red-600">{loadError}</p>
            <button onClick={() => navigateTo(null)} className="underline text-slate-700">
              Back to projects
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Opening project...
          </>
        )}
      </div>
    );
  }

  return (
    <ProjectWorkspace
      key={openProject.project.id}
      project={openProject.project}
      initialCanvas={openProject.canvas}
      onBack={() => navigateTo(null)}
    />
  );
}
