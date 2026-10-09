/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Plus, FolderOpen, Trash2, X, ExternalLink, Loader2, AlertCircle, LogOut, Pencil } from "lucide-react";
import { KickstartMark } from "./KickstartMark";
import { ProjectNameInput } from "./ProjectNameInput";
import {
  Project,
  ProjectSummary,
  listProjects,
  createProject,
  deleteProject,
  renameProject,
} from "../services/projectsService";

interface ProjectsHomeProps {
  userEmail: string;
  onSignOut: () => void;
  onOpenProject: (project: Project) => void;
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  const diffMins = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMins < 1) return "Edited just now";
  if (diffMins < 60) return `Edited ${diffMins} min ago`;
  if (diffMins < 60 * 24) return `Edited ${Math.round(diffMins / 60)} h ago`;
  return `Edited ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

export const ProjectsHome: React.FC<ProjectsHomeProps> = ({ userEmail, onSignOut, onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);

  const refresh = async () => {
    setLoadError(null);
    try {
      setProjects(await listProjects());
    } catch (err: any) {
      setLoadError(err?.message || "Could not load projects.");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDelete = async (project: ProjectSummary) => {
    if (!window.confirm(`Delete "${project.name}"? Its canvas will be lost. The Figma file is not changed.`)) {
      return;
    }
    try {
      await deleteProject(project.id);
      setProjects((prev) => prev?.filter((p) => p.id !== project.id) || null);
    } catch (err: any) {
      window.alert(`Could not delete the project: ${err?.message || "Unknown error"}`);
    }
  };

  const handleRename = async (project: ProjectSummary, name: string) => {
    const renamed = await renameProject(project.id, name);
    setProjects((prev) => prev?.map((p) => (p.id === project.id ? { ...p, ...renamed } : p)) || null);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-50 font-sans text-slate-900">
      <header className="h-12 px-4 bg-white border-b border-slate-200 flex items-center">
        <KickstartMark />
        <span className="ml-2 text-sm font-semibold tracking-tight text-slate-900">Kickstart</span>
        <span className="ml-auto text-xs text-slate-500 truncate">{userEmail}</span>
        <button
          onClick={onSignOut}
          className="ml-3 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md flex items-center gap-1 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New project
          </button>
        </div>

        {loadError && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <button onClick={refresh} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {!projects && !loadError && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading projects...
          </div>
        )}

        {projects && projects.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded-xl p-10 text-center">
            <FolderOpen className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No projects yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              A project holds one canvas and draws into a FigJam or Figma Design file.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first project
            </button>
          </div>
        )}

        {projects && projects.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map((project) => (
              <li key={project.id} className="group relative">
                {renamingProjectId === project.id ? (
                  <div className="w-full p-4 bg-white border border-slate-300 shadow-sm rounded-xl">
                    <ProjectNameInput
                      initialName={project.name}
                      onSave={(name) => handleRename(project, name)}
                      onDone={() => setRenamingProjectId(null)}
                      className="w-full text-sm font-semibold text-slate-900"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {project.nodeCount} {project.nodeCount === 1 ? "block" : "blocks"} · {formatUpdated(project.updatedAt)}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => onOpenProject(project)}
                    className="w-full text-left p-4 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm rounded-xl transition-all"
                  >
                    <p className="text-sm font-semibold text-slate-900 truncate pr-20">{project.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {project.nodeCount} {project.nodeCount === 1 ? "block" : "blocks"} · {formatUpdated(project.updatedAt)}
                    </p>
                  </button>
                )}
                <div
                  className={`absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
                    renamingProjectId === project.id ? "hidden" : ""
                  }`}
                >
                  <button
                    onClick={() => setRenamingProjectId(project.id)}
                    title="Rename project"
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={project.figjamFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open Figma file"
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => handleDelete(project)}
                    title="Delete project"
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {isCreateOpen && (
        <NewProjectModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={(project) => {
            setIsCreateOpen(false);
            onOpenProject(project);
          }}
        />
      )}
    </div>
  );
};

const NewProjectModal: React.FC<{
  onClose: () => void;
  onCreated: (project: Project) => void;
}> = ({ onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [figjamUrl, setFigjamUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);
    try {
      onCreated(await createProject({ name, figjamUrl }));
    } catch (err: any) {
      setError(err?.message || "Could not create the project.");
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">New project</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block text-xs font-medium text-slate-700 mb-1">Project name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Checkout redesign research"
          className="w-full px-3 py-2 mb-4 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 select-text"
        />

        <label className="block text-xs font-medium text-slate-700 mb-1">FigJam or Figma Design file link</label>
        <input
          value={figjamUrl}
          onChange={(e) => setFigjamUrl(e.target.value)}
          placeholder="https://www.figma.com/board/... or https://www.figma.com/design/..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 select-text"
        />
        <p className="text-[11px] text-slate-500 mt-1.5 mb-4 leading-relaxed">
          Wireframes, flows, journey maps and affinity maps for this project are drawn into this file. Projects can share a
          file. No file yet?{" "}
          <a href="https://figjam.new" target="_blank" rel="noreferrer" className="underline text-slate-700">
            Create one in FigJam
          </a>{" "}
          or{" "}
          <a href="https://figma.new" target="_blank" rel="noreferrer" className="underline text-slate-700">
            Figma Design
          </a>
          , then copy its link (Share &gt; Copy link).
        </p>

        {error && (
          <div className="p-2.5 mb-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating || !name.trim() || !figjamUrl.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-40 flex items-center gap-1.5"
          >
            {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create project
          </button>
        </div>
      </form>
    </div>
  );
};
