/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Layers,
  Sparkles,
  Download,
  Trash2,
  Plus,
  Share2,
  Workflow,
  HelpCircle,
  Undo2,
  FileText,
  MessageSquareQuote,
  FlaskConical,
  UserCheck,
  GitFork,
  Compass,
  Layout,
  ListChecks,
  CheckCircle2,
  LogOut,
  ArrowLeft,
  CloudOff,
} from "lucide-react";
import {
  GoogleUser,
  initAuth,
  googleSignIn,
  getAccessToken,
  logout,
} from "./services/googleAuth";
import {
  isTextBasedArtefact,
  createGoogleDocForArtefact,
} from "./services/googleDocsService";
import {
  generateFigjamArtefactViaMcp,
  checkFigjamBridgeStatus,
  getDefaultFigjamBoard,
  figmaFileUrl,
  figmaProductName,
} from "./services/figjamMcpService";
import { FigmaLogo } from "./components/ProductLogo";
import { Project, ProjectCanvasSaver } from "./services/projectsService";
import { apiFetch } from "./services/authService";
import {
  CanvasNode,
  CanvasEdge,
  ArtefactType,
  ARTEFACT_LIBRARY_ITEMS,
  UploadedDocument,
  isVisualFigjamArtefact,
  isAnnotationNode,
} from "./types/artefacts";
import { ArtefactLibraryPanel } from "./components/ArtefactLibraryPanel";
import { CanvasWorkspace } from "./components/CanvasWorkspace";
import { ArtefactDetailView } from "./components/ArtefactDetailView";
import { FigjamMcpModal } from "./components/FigjamMcpModal";

interface ProjectWorkspaceProps {
  project: Project;
  initialCanvas: { nodes: CanvasNode[]; edges: CanvasEdge[] };
  onBack: () => void;
}

type SaveStatus = "saved" | "saving" | "error";

export function ProjectWorkspace({ project, initialCanvas, onBack }: ProjectWorkspaceProps) {
  // Opens on the project's saved canvas; the library starts open only for an empty project
  const [nodes, setNodes] = useState<CanvasNode[]>(initialCanvas.nodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initialCanvas.edges);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(initialCanvas.nodes.length === 0);
  const [activeDetailNodeId, setActiveDetailNodeId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Google Workspace Authentication State
  const [currentUser, setCurrentUser] = useState<GoogleUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState<boolean>(false);
  const [isCreatingGoogleDoc, setIsCreatingGoogleDoc] = useState<boolean>(false);

  // "Figma" or "FigJam", from the project's file link
  const projectFigmaProduct = figmaProductName(project.figjamFileUrl);

  // FigJam MCP Connection State
  const [isFigjamModalOpen, setIsFigjamModalOpen] = useState<boolean>(false);
  const [isSyncingFigjam, setIsSyncingFigjam] = useState<boolean>(false);

  const nodesRef = useRef<CanvasNode[]>(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef<CanvasEdge[]>(edges);
  edgesRef.current = edges;

  // Autosave: every canvas change is written to Supabase shortly after it happens.
  // Saves run one at a time so a slow save can never overwrite a newer one.
  const saverRef = useRef(new ProjectCanvasSaver(project.id, initialCanvas));
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingSaveRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (!hasPendingSaveRef.current) return;
      hasPendingSaveRef.current = false;
      setSaveStatus("saving");
      try {
        await saverRef.current.save(nodesRef.current, edgesRef.current);
        setSaveStatus(hasPendingSaveRef.current ? "saving" : "saved");
      } catch (err) {
        console.error("Failed to save project canvas:", err);
        hasPendingSaveRef.current = true;
        setSaveStatus("error");
      }
    });
    return saveChainRef.current;
  }, []);

  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    hasPendingSaveRef.current = true;
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, 800);
  }, [nodes, edges, flushSave]);

  // Warn before closing the tab while changes are still on their way to Supabase
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingSaveRef.current) {
        flushSave();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushSave]);

  const handleBackToProjects = async () => {
    await flushSave();
    if (hasPendingSaveRef.current) {
      showNotification("Could not save the latest changes. Check your connection and try again.");
      return;
    }
    onBack();
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setGoogleAccessToken(token);
      },
      () => {
        setCurrentUser(null);
        setGoogleAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Add artefact from library
  const handleAddArtefact = useCallback(
    (type: ArtefactType, position?: { x: number; y: number }) => {
      const itemConfig = ARTEFACT_LIBRARY_ITEMS.find((it) => it.type === type);
      const isStickyNote = type === "sticky-note";
      const title = itemConfig?.defaultTitle || (isStickyNote ? "Sticky Note" : "Untitled Block");

      // Compute position in a staggered grid if not provided
      const defaultPos = {
        x: 120 + (nodes.length % 3) * 380,
        y: 100 + Math.floor(nodes.length / 3) * 280,
      };

      const newNode: CanvasNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        title,
        position: position || defaultPos,
        contextText: type === "context" ? "" : undefined,
        documents: type === "document" || type === "drive-folder" ? [] : undefined,
        driveFolderFiles: type === "drive-folder" ? [] : undefined,
        noteText: isStickyNote ? "" : undefined,
        noteColor: isStickyNote ? "yellow" : undefined,
      };

      setNodes((prev) => [...prev, newNode]);
      if (!isStickyNote) {
        showNotification(`Added ${itemConfig?.name || type} to canvas`);
      }
    },
    [nodes.length]
  );

  // Update node properties
  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<CanvasNode>) => {
      setNodes((prev) => {
        const next = prev.map((node) => (node.id === nodeId ? { ...node, ...updates } : node));
        nodesRef.current = next;
        return next;
      });
    },
    []
  );

  // Remove node and its associated edges
  const handleRemoveNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    setActiveDetailNodeId((curr) => (curr === nodeId ? null : curr));
  }, []);

  // Duplicate node (creating variation with identical upstream connections)
  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const sourceNode = nodesRef.current.find((n) => n.id === nodeId);
      if (!sourceNode) return;

      const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const duplicatedNode: CanvasNode = {
        ...sourceNode,
        id: newId,
        title: `${sourceNode.title} (Variation)`,
        isGenerating: false,
        error: null,
        // A variation gets its own outputs; keeping these would draw it back into the source's FigJam file
        figjamFileId: undefined,
        figjamFileUrl: undefined,
        figjamEmbedUrl: undefined,
        figjamCreatedAt: undefined,
        figjamBoardData: undefined,
        googleDocId: undefined,
        googleDocUrl: undefined,
        googleDocCreatedAt: undefined,
        position: {
          x: sourceNode.position.x + 30,
          y: sourceNode.position.y + 30,
        },
      };

      // Clone incoming connections so the duplicate receives the exact same inputs!
      const incomingEdges = edgesRef.current.filter((e) => e.to === nodeId);
      const newEdges: CanvasEdge[] = incomingEdges.map((e) => ({
        id: `edge-${e.from}-${newId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: e.from,
        to: newId,
      }));

      setNodes((prev) => [...prev, duplicatedNode]);
      setEdges((prev) => [...prev, ...newEdges]);
      showNotification(`Duplicated ${sourceNode.title} as variation`);
    },
    []
  );

  // Add edge connection
  const handleAddEdge = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      // Annotations (e.g. sticky notes) can never be wired to artefacts
      const endpoints = nodesRef.current.filter((n) => n.id === from || n.id === to);
      if (endpoints.some((n) => isAnnotationNode(n.type))) return;
      // Prevent duplicate edges
      const exists = edges.some((e) => e.from === from && e.to === to);
      if (exists) return;

      const newEdge: CanvasEdge = {
        id: `edge-${from}-${to}-${Date.now()}`,
        from,
        to,
      };

      setEdges((prev) => [...prev, newEdge]);
      showNotification("Connected blocks");
    },
    [edges]
  );

  // Remove edge connection
  const handleRemoveEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  // Clear canvas to 100% blank
  const handleClearCanvas = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setActiveDetailNodeId(null);
    showNotification("Canvas cleared");
  }, []);

  // Compute all upstream connected sources for any node
  const getUpstreamSourcesForNode = useCallback(
    (targetNodeId: string) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      // Find all incoming nodes via direct and transitive ancestors in DAG
      const visited = new Set<string>();
      const queue = [targetNodeId];

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const parents = currentEdges.filter((e) => e.to === curr).map((e) => e.from);
        for (const p of parents) {
          if (!visited.has(p)) {
            visited.add(p);
            queue.push(p);
          }
        }
      }

      const upstreamNodes = currentNodes.filter((n) => visited.has(n.id));

      return upstreamNodes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        contextText: n.contextText,
        documentsCount: n.documents?.length || 0,
        documentsNames: (n.documents || []).map((d) => d.name),
        hasGeneratedData: Boolean(n.generatedData?.data),
        documents: n.documents,
        generatedData: n.generatedData?.data,
        driveFolderName: n.driveFolderName,
        driveFolderId: n.driveFolderId,
      }));
    },
    []
  );

  // Google Sign In handler
  const handleGoogleSignIn = async (): Promise<string | null> => {
    setIsSigningInGoogle(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setGoogleAccessToken(res.accessToken);
        showNotification(
          `Connected Google account: ${res.user.displayName || res.user.email}`
        );
        return res.accessToken;
      }
    } catch (err: any) {
      console.error("Google sign in error:", err);
      showNotification(`Sign in failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSigningInGoogle(false);
    }
    return null;
  };

  const handleGoogleLogout = async () => {
    await logout();
    setCurrentUser(null);
    setGoogleAccessToken(null);
    showNotification("Disconnected Google account");
  };

  // Create or sync a Google Doc for any generated artefact
  const handleCreateOrSyncGoogleDoc = async (nodeId: string) => {
    const targetNode = nodesRef.current.find((n) => n.id === nodeId);
    if (!targetNode || !targetNode.generatedData?.data) return;

    let token = googleAccessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      token = await handleGoogleSignIn();
    }
    if (!token) {
      showNotification("Please sign in with Google to create a Google Doc.");
      return;
    }

    setIsCreatingGoogleDoc(true);
    try {
      showNotification(`Creating Google Doc for ${targetNode.title}...`);
      const docResult = await createGoogleDocForArtefact({
        title: targetNode.title,
        type: targetNode.type,
        data: targetNode.generatedData.data,
        accessToken: token,
      });

      handleUpdateNode(nodeId, {
        googleDocId: docResult.documentId,
        googleDocUrl: docResult.documentUrl,
        googleDocCreatedAt: new Date().toISOString(),
      });

      showNotification(`Created Google Doc for ${targetNode.title}!`);
    } catch (err: any) {
      console.error("Failed to create Google Doc:", err);
      showNotification(
        `Google Doc creation failed: ${err?.message || "Check permissions"}`
      );
    } finally {
      setIsCreatingGoogleDoc(false);
    }
  };

  // Create or sync a FigJam board for any visual artefact via MCP
  const handleSyncFigjam = async (nodeId: string, customFileKey?: string) => {
    const targetNode = nodesRef.current.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const effectiveFileKey =
      customFileKey || targetNode.figjamFileId || getDefaultFigjamBoard();

    if (!effectiveFileKey) {
      const bridge = await checkFigjamBridgeStatus();
      if (!bridge.figjamReady) {
        showNotification(
          "Figma is not connected. In Figma Desktop, open the project's FigJam or Figma Design file and run Plugins > Development > Figma Desktop Bridge."
        );
        return;
      }
      if (targetNode.generatedData?.data) {
        setIsSyncingFigjam(true);
        try {
          const figjamResult = await generateFigjamArtefactViaMcp({
            title: targetNode.title,
            type: targetNode.type,
            data: targetNode.generatedData.data,
          });
          handleUpdateNode(nodeId, {
            figjamFileId: figjamResult.fileId || undefined,
            figjamFileUrl: figjamResult.fileUrl || undefined,
            figjamEmbedUrl: figjamResult.embedUrl || undefined,
            figjamCreatedAt: new Date().toISOString(),
            figjamBoardData: figjamResult.canvasPayload || figjamResult.boardData,
            error: null,
          });
          showNotification(figjamResult.summaryText);
        } catch (err: any) {
          showNotification(`${projectFigmaProduct} error: ${err?.message || "Failed to draw the artefact"}`);
        } finally {
          setIsSyncingFigjam(false);
        }
      } else {
        await handleGenerateArtefact(nodeId, targetNode.customGuidance);
      }
      return;
    }

    // The project link already has the right editor path; any other file uses /file/, which redirects
    const fileUrl =
      effectiveFileKey === project.figjamFileKey ? project.figjamFileUrl : figmaFileUrl(effectiveFileKey);
    const embedUrl = `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(
      fileUrl
    )}`;

    // If node doesn't have generatedData yet, check if upstream inputs exist to generate fresh into FigJam
    const upstreamInputs = getUpstreamSourcesForNode(nodeId);
    if (!targetNode.generatedData?.data && upstreamInputs.length > 0) {
      handleUpdateNode(nodeId, {
        figjamFileId: effectiveFileKey,
        figjamFileUrl: fileUrl,
        figjamEmbedUrl: embedUrl,
        figjamCreatedAt: new Date().toISOString(),
        error: null,
      });
      await handleGenerateArtefact(nodeId, targetNode.customGuidance, effectiveFileKey);
      return;
    }

    // If no data generated yet and no upstream inputs, link the board inline
    if (!targetNode.generatedData?.data) {
      handleUpdateNode(nodeId, {
        figjamFileId: effectiveFileKey,
        figjamFileUrl: fileUrl,
        figjamEmbedUrl: embedUrl,
        figjamCreatedAt: new Date().toISOString(),
        error: null,
      });
      showNotification(`${projectFigmaProduct} file connected & displayed inline! Connect inputs on canvas to generate specifications.`);
      return;
    }

    setIsSyncingFigjam(true);
    try {
      showNotification(`Synchronizing ${targetNode.title} with ${projectFigmaProduct} via MCP...`);
      const figjamResult = await generateFigjamArtefactViaMcp({
        title: targetNode.title,
        type: targetNode.type,
        data: targetNode.generatedData.data,
        fileKey: effectiveFileKey,
      });

      if (figjamResult.fileId) {
        handleUpdateNode(nodeId, {
          figjamFileId: figjamResult.fileId,
          figjamFileUrl: figjamResult.fileUrl || fileUrl,
          figjamEmbedUrl: figjamResult.embedUrl || embedUrl,
          figjamCreatedAt: new Date().toISOString(),
          figjamBoardData: figjamResult.canvasPayload || figjamResult.boardData,
        });
        showNotification(figjamResult.summaryText);
      } else {
        showNotification(
          `${figjamResult.summaryText} Figma did not share the file link, so it cannot be shown inline.`
        );
      }
    } catch (err: any) {
      console.error("Failed to sync FigJam board via MCP:", err);
      showNotification(
        `${projectFigmaProduct} MCP error: ${err?.message || "Failed to sync board"}`
      );
    } finally {
      setIsSyncingFigjam(false);
    }
  };

  // Generate asset from connected inputs independently
  const handleGenerateArtefact = async (
    nodeId: string,
    customGuidance: string = "",
    overrideFigjamKey?: string
  ) => {
    const targetNode = nodesRef.current.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const upstreamInputs = getUpstreamSourcesForNode(nodeId);
    if (upstreamInputs.length === 0) {
      showNotification("Please connect at least one input block on canvas first.");
      return;
    }

    // For visual artefacts, nothing should be generated outside of FigJam!
    // Drawing needs the Figma Desktop Bridge plugin running inside an open FigJam file.
    if (isVisualFigjamArtefact(targetNode.type)) {
      const bridge = await checkFigjamBridgeStatus();
      if (!bridge.figjamReady) {
        const message =
          "Figma is not connected. In Figma Desktop, open the project's FigJam or Figma Design file and run Plugins > Development > Figma Desktop Bridge, then click Generate again.";
        showNotification(message);
        handleUpdateNode(nodeId, { isGenerating: false, error: message });
        setActiveDetailNodeId(nodeId);
        return;
      }
    }

    // Set generating state ONLY on this specific node
    handleUpdateNode(nodeId, {
      isGenerating: true,
      error: null,
      customGuidance,
    });

    try {
      const response = await apiFetch("/api/artefact/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artefactType: targetNode.type,
          nodeTitle: targetNode.title,
          customGuidance: customGuidance || targetNode.customGuidance || "",
          upstreamInputs,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to generate asset.");
      }

      let googleDocId = targetNode.googleDocId;
      let googleDocUrl = targetNode.googleDocUrl;
      let googleDocCreatedAt = targetNode.googleDocCreatedAt;

      // For all text-based artefacts, generate a Google Doc automatically
      if (isTextBasedArtefact(targetNode.type)) {
        let token = googleAccessToken;
        if (!token) {
          token = await getAccessToken();
        }

        // If authenticated with Google, create the document directly in user's Drive
        if (token) {
          try {
            showNotification(`Creating Google Doc for ${targetNode.title}...`);
            const docResult = await createGoogleDocForArtefact({
              title: targetNode.title,
              type: targetNode.type,
              data: result.data,
              accessToken: token,
            });
            googleDocId = docResult.documentId;
            googleDocUrl = docResult.documentUrl;
            googleDocCreatedAt = new Date().toISOString();
          } catch (docErr: any) {
            console.warn("Failed to create Google Doc automatically:", docErr);
          }
        }
      }

      // For all visual artefacts (wireframe, user-journey-map, user-flow), generate FigJam board automatically via MCP
      let figjamFileId = overrideFigjamKey || targetNode.figjamFileId;
      let figjamFileUrl = targetNode.figjamFileUrl;
      let figjamEmbedUrl = targetNode.figjamEmbedUrl;
      let figjamCreatedAt = targetNode.figjamCreatedAt;
      let figjamBoardData = targetNode.figjamBoardData;

      let figjamError: string | null = null;
      if (isVisualFigjamArtefact(targetNode.type)) {
        try {
          showNotification(`Drawing ${targetNode.title} in ${projectFigmaProduct}...`);
          // Draw into the FigJam file the Desktop Bridge plugin is open in, unless a file was chosen explicitly
          const figjamResult = await generateFigjamArtefactViaMcp({
            title: targetNode.title,
            type: targetNode.type,
            data: result.data,
            fileKey: overrideFigjamKey,
          });
          if (figjamResult.fileId) {
            figjamFileId = figjamResult.fileId;
            figjamFileUrl = figjamResult.fileUrl || figmaFileUrl(figjamResult.fileId);
            figjamEmbedUrl = figjamResult.embedUrl || `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(figjamFileUrl)}`;
            figjamCreatedAt = new Date().toISOString();
          }
          figjamBoardData = figjamResult.canvasPayload || figjamResult.boardData;
          showNotification(figjamResult.summaryText);
        } catch (figjamErr: any) {
          console.error("Failed to draw artefact in FigJam:", figjamErr);
          figjamError = figjamErr?.message || `Failed to draw the artefact in ${projectFigmaProduct}.`;
        }
      }

      handleUpdateNode(nodeId, {
        generatedData: {
          type: targetNode.type as any,
          data: result.data,
        },
        generatedAt: result.generatedAt || new Date().toISOString(),
        isGenerating: false,
        customGuidance,
        error: figjamError,
        googleDocId,
        googleDocUrl,
        googleDocCreatedAt,
        figjamFileId,
        figjamFileUrl,
        figjamEmbedUrl,
        figjamCreatedAt,
        figjamBoardData,
      });

      if (figjamError) {
        showNotification(`${projectFigmaProduct} error: ${figjamError}`);
        setActiveDetailNodeId(nodeId);
      } else if (isVisualFigjamArtefact(targetNode.type)) {
        // Success message was already shown with the FigJam draw summary
      } else if (googleDocId) {
        showNotification(
          `Generated & created Google Doc for ${targetNode.title}!`
        );
      } else {
        showNotification(`Generated ${targetNode.title}!`);
      }
    } catch (err: any) {
      console.error(`Error generating artefact for ${nodeId}:`, err);
      handleUpdateNode(nodeId, {
        isGenerating: false,
        error: err?.message || "Failed to generate.",
      });
      showNotification(`Generation error: ${err?.message || "Unknown error"}`);
    }
  };

  // Export full Canvas state to JSON file
  const handleExportCanvasJSON = () => {
    const canvasData = {
      exportDate: new Date().toISOString(),
      nodes,
      edges,
    };
    const blob = new Blob([JSON.stringify(canvasData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kickstart-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("Exported canvas JSON");
  };

  // Active node being inspected in detail drawer
  const activeDetailNode = useMemo(
    () => nodes.find((n) => n.id === activeDetailNodeId) || null,
    [nodes, activeDetailNodeId]
  );

  const activeUpstreamSources = useMemo(
    () =>
      activeDetailNodeId ? getUpstreamSourcesForNode(activeDetailNodeId) : [],
    [activeDetailNodeId, getUpstreamSourcesForNode]
  );

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 select-none">
      {/* Top Application Bar */}
      <header className="h-12 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleBackToProjects}
            className="p-1 -ml-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Back to projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold tracking-tight text-slate-400">Kickstart</span>
          <span className="text-sm text-slate-300">/</span>
          <span className="text-sm font-semibold tracking-tight text-slate-900 truncate max-w-[240px]">
            {project.name}
          </span>
          <span
            className={`ml-1 text-[11px] font-medium flex items-center gap-1 ${
              saveStatus === "error" ? "text-red-600" : "text-slate-400"
            }`}
          >
            {saveStatus === "error" && <CloudOff className="w-3 h-3" />}
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving..." : "Not saved"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {currentUser ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || "Google User"}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {(currentUser.displayName || currentUser.email || "G")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
              <span className="text-slate-700 font-medium max-w-[130px] truncate">
                {currentUser.displayName || currentUser.email}
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200/60 px-1.5 py-0.2 rounded font-semibold">
                Drive & Docs
              </span>
              <button
                onClick={handleGoogleLogout}
                title="Disconnect Google account"
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningInGoogle}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors"
              title="Connect Google Drive & Docs to import folders and create documents"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isSigningInGoogle ? "Connecting..." : "Connect Drive & Docs"}</span>
            </button>
          )}

          {/* Figma / FigJam MCP Connection Status & Config Button */}
          <a
            href={project.figjamFileUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
            title={`Open this project's ${projectFigmaProduct} file`}
          >
            Project {projectFigmaProduct} file
          </a>

          <button
            onClick={() => setIsFigjamModalOpen(true)}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors"
            title={`${projectFigmaProduct} MCP Connection (Model Context Protocol)`}
          >
            <FigmaLogo className="w-3.5 h-3.5" />
            <span>{projectFigmaProduct} MCP</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          </button>

          <button
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border ${
              isLibraryOpen
                ? "bg-slate-100 border-slate-300 text-slate-900"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-600" />
            <span>Artefact Library</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {/* Infinite Node Canvas */}
        <CanvasWorkspace
          nodes={nodes}
          edges={edges}
          activeDetailNodeId={activeDetailNodeId}
          onUpdateNode={handleUpdateNode}
          onRemoveNode={handleRemoveNode}
          onDuplicateNode={handleDuplicateNode}
          onAddEdge={handleAddEdge}
          onRemoveEdge={handleRemoveEdge}
          onOpenDetailView={(nodeId) => setActiveDetailNodeId(nodeId)}
          onGenerateArtefact={(nodeId) => handleGenerateArtefact(nodeId, "")}
          onDropArtefact={handleAddArtefact}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          isLibraryOpen={isLibraryOpen}
          googleAccessToken={googleAccessToken}
          onGoogleSignIn={handleGoogleSignIn}
        />

        {/* Artefact Library Side Panel (Open by default) */}
        <ArtefactLibraryPanel
          isOpen={isLibraryOpen}
          onToggleOpen={() => setIsLibraryOpen(!isLibraryOpen)}
          onAddArtefact={(type) => handleAddArtefact(type)}
          onClearCanvas={handleClearCanvas}
          hasNodes={nodes.length > 0}
        />

        {/* Detailed Artefact Inspection & Generation Drawer */}
        {activeDetailNode && (
          <ArtefactDetailView
            key={activeDetailNode.id}
            node={activeDetailNode}
            upstreamSources={activeUpstreamSources}
            isOpen={Boolean(activeDetailNode)}
            onClose={() => setActiveDetailNodeId(null)}
            onGenerate={handleGenerateArtefact}
            onDuplicate={handleDuplicateNode}
            onUpdateTitle={(id, title) => handleUpdateNode(id, { title })}
            onUpdateNode={handleUpdateNode}
            onOpenFigjamModal={() => setIsFigjamModalOpen(true)}
            isGenerating={Boolean(activeDetailNode.isGenerating)}
            currentUser={currentUser}
            onGoogleSignIn={handleGoogleSignIn}
            onCreateGoogleDoc={handleCreateOrSyncGoogleDoc}
            isCreatingGoogleDoc={isCreatingGoogleDoc}
            onSyncFigjam={handleSyncFigjam}
            isSyncingFigjam={isSyncingFigjam}
          />
        )}

        {/* FigJam MCP Connection Drawer / Modal */}
        <FigjamMcpModal
          isOpen={isFigjamModalOpen}
          onClose={() => setIsFigjamModalOpen(false)}
        />

        {/* Floating Notification Toast */}
        {notification && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}
      </main>
    </div>
  );
}
