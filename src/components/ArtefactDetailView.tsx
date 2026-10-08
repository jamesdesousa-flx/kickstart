/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Download,
  CopyPlus,
  RefreshCw,
  FileText,
  MessageSquareQuote,
  FlaskConical,
  UserCheck,
  GitFork,
  Compass,
  Layout,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  ExternalLink,
  Laptop,
  Smartphone,
  Tablet,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Smile,
  Meh,
  Frown,
  Activity,
  Settings,
} from "lucide-react";
import {
  CanvasNode,
  ArtefactType,
  InterviewScriptData,
  UsabilityScriptData,
  UserPersonaData,
  UserFlowData,
  UserJourneyMapData,
  WireframeData,
  SurveyQuestionsData,
  isVisualFigjamArtefact,
} from "../types/artefacts";
import type { GoogleUser } from "../services/googleAuth";
import { isTextBasedArtefact } from "../services/googleDocsService";
import {
  extractFigmaFileKey,
  readFigjamBoardViaMcp,
  getDefaultFigjamBoard,
  pingFigjamMcpServer,
} from "../services/figjamMcpService";

interface UpstreamSourceInfo {
  id: string;
  type: ArtefactType;
  title: string;
  contextText?: string;
  documentsCount: number;
  documentsNames: string[];
  hasGeneratedData: boolean;
}

interface ArtefactDetailViewProps {
  node: CanvasNode;
  upstreamSources: UpstreamSourceInfo[];
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (nodeId: string, customGuidance: string, overrideFigjamKey?: string) => Promise<void>;
  onDuplicate: (nodeId: string) => void;
  onUpdateTitle: (nodeId: string, title: string) => void;
  onUpdateNode?: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onOpenFigjamModal?: () => void;
  isGenerating?: boolean;
  currentUser?: GoogleUser | null;
  onGoogleSignIn?: () => Promise<string | null>;
  onCreateGoogleDoc?: (nodeId: string) => Promise<void>;
  isCreatingGoogleDoc?: boolean;
  onSyncFigjam?: (nodeId: string, customFileKey?: string) => Promise<void>;
  isSyncingFigjam?: boolean;
}

export const ArtefactDetailView: React.FC<ArtefactDetailViewProps> = ({
  node,
  upstreamSources,
  isOpen,
  onClose,
  onGenerate,
  onDuplicate,
  onUpdateTitle,
  onUpdateNode,
  onOpenFigjamModal,
  isGenerating: propIsGenerating,
  currentUser,
  onGoogleSignIn,
  onCreateGoogleDoc,
  isCreatingGoogleDoc,
  onSyncFigjam,
  isSyncingFigjam,
}) => {
  // Always derive generation state from the specific node, so detail views of different blocks never collide
  const isGenerating = Boolean(node.isGenerating ?? propIsGenerating);
  const [customGuidance, setCustomGuidance] = useState(node.customGuidance || "");
  const isTextDoc = isTextBasedArtefact(node.type);
  const isVisualFigjam = isVisualFigjamArtefact(node.type);

  const [localConnectedKey, setLocalConnectedKey] = useState<string | null>(
    node.figjamFileId || getDefaultFigjamBoard() || null
  );
  const activeFigjamKey = node.figjamFileId || localConnectedKey;

  // Default to Google Doc view or FigJam view whenever synced
  const [viewMode, setViewMode] = useState<"google-doc" | "figjam" | "cards">(
    isTextDoc && node.googleDocId
      ? "google-doc"
      : isVisualFigjam && activeFigjamKey
      ? "figjam"
      : "cards"
  );
  const [embedMode, setEmbedMode] = useState<"edit" | "preview">("edit");
  const [boardUrlInput, setBoardUrlInput] = useState(
    node.figjamFileUrl || node.figjamFileId || localConnectedKey || ""
  );
  const [isEditingBoardUrl, setIsEditingBoardUrl] = useState(false);
  const [readSummary, setReadSummary] = useState<string | null>(null);
  const [isReadingBoard, setIsReadingBoard] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isConnectingBoard, setIsConnectingBoard] = useState(false);

  const [mcpStatus, setMcpStatus] = useState<{
    checked: boolean;
    checking: boolean;
    online: boolean;
    latencyMs: number;
    error?: string;
  }>({
    checked: false,
    checking: false,
    online: false,
    latencyMs: 0,
  });

  useEffect(() => {
    setCustomGuidance(node.customGuidance || "");
    const initialKey = node.figjamFileId || getDefaultFigjamBoard() || null;
    if (initialKey) {
      setLocalConnectedKey(initialKey);
    }
    setBoardUrlInput(node.figjamFileUrl || node.figjamFileId || initialKey || "");
  }, [node.id, node.customGuidance, node.figjamFileUrl, node.figjamFileId]);

  useEffect(() => {
    if (isTextDoc && node.googleDocId) {
      setViewMode("google-doc");
    } else if (isVisualFigjam && (node.figjamFileId || localConnectedKey)) {
      setViewMode("figjam");
    }
  }, [node.id, node.googleDocId, node.figjamFileId, localConnectedKey, isTextDoc, isVisualFigjam]);

  const [copiedFigjam, setCopiedFigjam] = useState(false);

  const handleCheckMcpConnection = async () => {
    setMcpStatus((prev) => ({ ...prev, checking: true, error: undefined }));
    try {
      const ping = await pingFigjamMcpServer();
      setMcpStatus({
        checked: true,
        checking: false,
        online: ping.online,
        latencyMs: ping.latencyMs,
      });
    } catch (e: any) {
      setMcpStatus({
        checked: true,
        checking: false,
        online: false,
        latencyMs: 0,
        error: e?.message || "Failed to reach MCP server",
      });
    }
  };

  const handleConnectFigjamBoard = async (urlOrKey?: string) => {
    setConnectError(null);
    const raw = (urlOrKey || boardUrlInput).trim();
    if (!raw) {
      setConnectError("Please paste a FigJam board URL or file key.");
      return;
    }
    const key = extractFigmaFileKey(raw);
    if (!key) {
      setConnectError(
        "Could not detect a FigJam board key. Please paste a URL like https://www.figma.com/board/... or enter your file key."
      );
      return;
    }
    const fileUrl = `https://www.figma.com/board/${key}`;
    const embedUrl = `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(
      fileUrl
    )}`;

    setIsConnectingBoard(true);
    try {
      setLocalConnectedKey(key);
      setBoardUrlInput(fileUrl);
      setIsEditingBoardUrl(false);
      setViewMode("figjam");

      onUpdateNode?.(node.id, {
        figjamFileId: key,
        figjamFileUrl: fileUrl,
        figjamEmbedUrl: embedUrl,
        figjamCreatedAt: new Date().toISOString(),
        error: null,
      });

      // Synchronize visual artefact into the newly connected FigJam board
      if (onSyncFigjam) {
        await onSyncFigjam(node.id, key);
      } else if (onGenerate) {
        await onGenerate(node.id, customGuidance, key);
      }
    } catch (err: any) {
      console.error("Error generating visual artefact after FigJam connect:", err);
      setConnectError(err?.message || "Failed to sync to FigJam board");
    } finally {
      setIsConnectingBoard(false);
    }
  };

  const handleReadFigjamBoard = async () => {
    if (!node.figjamFileId) return;
    setIsReadingBoard(true);
    try {
      const readRes = await readFigjamBoardViaMcp(node.figjamFileId);
      setReadSummary(readRes.summaryText);
    } catch (err: any) {
      setReadSummary(`Error reading FigJam board: ${err?.message || "Failed"}`);
    } finally {
      setIsReadingBoard(false);
    }
  };
  const [showSourcesDetails, setShowSourcesDetails] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [selectedWireframeScreenType, setSelectedWireframeScreenType] = useState<
    "mobile" | "web-desktop" | "tablet"
  >("web-desktop");
  const [selectedWireframeStateIndex, setSelectedWireframeStateIndex] = useState(0);

  if (!isOpen) return null;

  const getArtefactBadgeInfo = (type: ArtefactType) => {
    switch (type) {
      case "interview-script":
        return {
          label: "Interview Script",
          icon: <MessageSquareQuote className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "usability-script":
        return {
          label: "Usability Testing Script",
          icon: <FlaskConical className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "user-persona":
        return {
          label: "User Persona",
          icon: <UserCheck className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "user-flow":
        return {
          label: "User Flow",
          icon: <GitFork className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "user-journey-map":
        return {
          label: "User Journey Map",
          icon: <Compass className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "wireframe":
        return {
          label: "Wireframe & Layout",
          icon: <Layout className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      case "survey-questions":
        return {
          label: "Survey Questions",
          icon: <ListChecks className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
      default:
        return {
          label: "Artefact",
          icon: <FileText className="w-4 h-4 text-slate-700" />,
          color: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  };

  const badgeInfo = getArtefactBadgeInfo(node.type);
  const hasData = Boolean(node.generatedData?.data);

  // Markdown copy generation
  const handleCopyMarkdown = () => {
    if (!node.generatedData?.data) return;
    const md = `# ${node.title}\n\nType: ${badgeInfo.label}\nGenerated: ${node.generatedAt || new Date().toISOString()}\n\n${JSON.stringify(node.generatedData.data, null, 2)}`;
    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const handleDownloadJSON = () => {
    if (!node.generatedData?.data) return;
    const blob = new Blob([JSON.stringify(node.generatedData.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${node.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/30 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150">
      <div className="w-full max-w-3xl h-full bg-white shadow-xl flex flex-col border-l border-slate-200 overflow-hidden">
        {/* Top Header */}
        <div className="p-3.5 sm:px-5 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-1.5 rounded-md bg-slate-100 border border-slate-200">
              {badgeInfo.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.2 rounded border bg-slate-100 text-slate-600 border-slate-200">
                  {badgeInfo.label}
                </span>
                {node.generatedAt && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Generated
                  </span>
                )}
              </div>
              <input
                type="text"
                value={node.title}
                onChange={(e) => onUpdateTitle(node.id, e.target.value)}
                className="text-base font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-500 focus:bg-white focus:outline-none px-1 -mx-1 rounded transition-colors w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDuplicate(node.id)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md text-xs font-medium flex items-center gap-1 transition-colors border border-slate-200 bg-white"
              title="Duplicate block to create variation"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Upstream Sources Banner */}
        <div className="px-4 sm:px-5 py-2 bg-slate-50 border-b border-slate-200 flex flex-col gap-1 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-500">
                Inputs:
              </span>
              {upstreamSources.length === 0 ? (
                <span className="text-amber-600 font-medium text-[11px]">
                  None (connect an input block on canvas to enable generation)
                </span>
              ) : (
                upstreamSources.map((src) => (
                  <span
                    key={src.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[11px] font-medium"
                  >
                    <span className="text-[10px] text-slate-400">
                      {src.type === "drive-folder" ? "[drive folder]" : `[${src.type.replace("-", " ")}]`}
                    </span>
                    {src.title}
                  </span>
                ))
              )}
            </div>

            {upstreamSources.length > 0 && (
              <button
                onClick={() => setShowSourcesDetails(!showSourcesDetails)}
                className="text-[11px] font-medium text-slate-600 hover:text-slate-900 ml-2 shrink-0"
              >
                {showSourcesDetails ? "Hide input details" : "Inspect inputs"}
              </button>
            )}
          </div>

          {/* Expanded Upstream Source Content */}
          {showSourcesDetails && upstreamSources.length > 0 && (
            <div className="mt-1.5 p-2.5 bg-white rounded-lg border border-slate-200 text-slate-700 space-y-1.5 text-xs max-h-40 overflow-y-auto">
              {upstreamSources.map((src, i) => (
                <div key={src.id} className="pb-1.5 border-b border-slate-100 last:border-0">
                  <div className="font-semibold text-slate-800 text-[11px]">
                    #{i + 1} {src.title} ({src.type === "drive-folder" ? "Google Drive Folder" : src.type})
                  </div>
                  {(src as any).driveFolderName && (
                    <p className="text-amber-700 font-medium text-[10px] mt-0.5">
                      📁 Google Drive Folder: {(src as any).driveFolderName}
                    </p>
                  )}
                  {src.contextText && (
                    <p className="text-slate-600 text-[11px] whitespace-pre-line mt-0.5">
                      {src.contextText.slice(0, 240)}
                      {src.contextText.length > 240 ? "..." : ""}
                    </p>
                  )}
                  {src.documentsCount > 0 && (
                    <p className="text-slate-500 text-[10px] mt-0.5">
                      {src.documentsCount} attached file{src.documentsCount > 1 ? "s" : ""}: {src.documentsNames.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generation Action & Custom Prompt Strip */}
        <div className="p-3.5 sm:px-5 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex-1">
            <input
              type="text"
              value={customGuidance}
              onChange={(e) => setCustomGuidance(e.target.value)}
              placeholder="Variation instructions (e.g. 'Target senior users', 'Focus on mobile')..."
              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onGenerate(node.id, customGuidance)}
              disabled={isGenerating || upstreamSources.length === 0}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border ${
                upstreamSources.length === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-slate-900 hover:bg-slate-800 text-white border-slate-900 cursor-pointer"
              }`}
              title={
                upstreamSources.length === 0
                  ? "Connect at least one input block on canvas to generate"
                  : undefined
              }
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : hasData ? (
                <span>Re-generate</span>
              ) : (
                <span>Generate</span>
              )}
            </button>

            {hasData && (
              <>
                <button
                  onClick={handleCopyMarkdown}
                  className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-xs transition-colors"
                  title="Copy JSON / Markdown"
                >
                  {copiedMarkdown ? (
                    <Check className="w-3.5 h-3.5 text-slate-900" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={handleDownloadJSON}
                  className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-xs transition-colors"
                  title="Download JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50">
          {node.error && !isGenerating && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-rose-900">Generation error</p>
                <p className="text-rose-700 mt-0.5 break-words">{node.error}</p>
              </div>
              <button
                onClick={() => onGenerate(node.id, customGuidance)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-medium shrink-0 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* VISUAL ARTEFACTS (USER FLOW, USER JOURNEY MAP, WIREFRAME): ONLY IN FIGJAM VIA MCP */}
          {isVisualFigjam ? (
            activeFigjamKey ? (
              /* REAL FIGJAM FILE EMBEDDED INLINE */
              <div className="flex flex-col space-y-3 animate-in fade-in duration-150">
                {/* Embedded FigJam Toolbar Header */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#7B61FF]/10 border border-[#7B61FF]/30 text-[#7B61FF] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5.5 8.5C5.5 6.84315 6.84315 5.5 8.5 5.5H12V12H8.5C6.84315 12 5.5 10.6569 5.5 8.5Z" />
                        <path d="M12 5.5H15.5C17.1569 5.5 18.5 6.84315 18.5 8.5C18.5 10.6569 17.1569 12 12V5.5Z" />
                        <path d="M5.5 15.5C5.5 13.8431 6.84315 12.5 8.5 12.5H12V19H8.5C6.84315 19 5.5 17.6569 5.5 15.5Z" />
                        <circle cx="15.5" cy="15.5" r="3.5" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          FigJam Board
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Live in FigJam
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono px-1 py-0.2 bg-slate-100 rounded">
                          {activeFigjamKey}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        Interactive FigJam file displayed inline via Model Context Protocol
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Open in full FigJam tab */}
                    <a
                      href={
                        node.figjamFileUrl ||
                        `https://www.figma.com/board/${activeFigjamKey}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-semibold text-[#7B61FF] hover:text-[#684FF2] bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                      title="Open board in FigJam tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in FigJam</span>
                    </a>

                    <button
                      onClick={() => setIsEditingBoardUrl(!isEditingBoardUrl)}
                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Change connected FigJam Board"
                    >
                      Change Board
                    </button>
                  </div>
                </div>

                {/* Change Board URL Input drawer if toggled */}
                {isEditingBoardUrl && (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-2">
                    <input
                      type="text"
                      value={boardUrlInput}
                      onChange={(e) => setBoardUrlInput(e.target.value)}
                      placeholder="Paste new FigJam board URL (https://www.figma.com/board/...)"
                      className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                    />
                    <button
                      onClick={() => handleConnectFigjamBoard()}
                      disabled={isConnectingBoard}
                      className="px-3 py-1.5 bg-[#7B61FF] text-white text-xs font-semibold rounded-lg"
                    >
                      {isConnectingBoard ? "Updating..." : "Update"}
                    </button>
                    <button
                      onClick={() => setIsEditingBoardUrl(false)}
                      className="px-2 py-1.5 text-slate-500 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="w-full h-[620px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col relative">
                  <iframe
                    key={activeFigjamKey}
                    src={
                      node.figjamEmbedUrl ||
                      `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(
                        node.figjamFileUrl ||
                          `https://www.figma.com/board/${activeFigjamKey}`
                      )}`
                    }
                    className="w-full flex-1 border-0 bg-white"
                    title={node.title}
                    allowFullScreen
                    allow="clipboard-read; clipboard-write"
                  />
                  <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Live FigJam board integration • Read & write via Model Context Protocol
                    </span>
                    <a
                      href={
                        node.figjamFileUrl ||
                        `https://www.figma.com/board/${activeFigjamKey}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#7B61FF] hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Open in FigJam tab</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              /* FIGJAM MCP CONNECTION REQUIRED SCREEN */
              <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-6 animate-in fade-in">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#7B61FF]/10 border border-[#7B61FF]/30 text-[#7B61FF] flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5.5 8.5C5.5 6.84315 6.84315 5.5 8.5 5.5H12V12H8.5C6.84315 12 5.5 10.6569 5.5 8.5Z" />
                      <path d="M12 5.5H15.5C17.1569 5.5 18.5 6.84315 18.5 8.5C18.5 10.6569 17.1569 12 12V5.5Z" />
                      <path d="M5.5 15.5C5.5 13.8431 6.84315 12.5 8.5 12.5H12V19H8.5C6.84315 19 5.5 17.6569 5.5 15.5Z" />
                      <circle cx="15.5" cy="15.5" r="3.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        FigJam MCP Connection Required
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        Figma Not Connected
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Figma is not connected. For visual artefacts (<strong>{badgeInfo.label}</strong>), nothing is generated outside of FigJam. Check your MCP connection or link a FigJam board below to generate and display this artefact inline.
                    </p>
                  </div>
                </div>

                {/* MCP Diagnostics Box */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Model Context Protocol (MCP) Server Status
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Protocol: JSON-RPC 2.0 • Tools: <code className="text-[#7B61FF]">read_figjam_file</code>, <code className="text-[#7B61FF]">write_figjam_artefact</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCheckMcpConnection}
                        disabled={mcpStatus.checking}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors shadow-2xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${mcpStatus.checking ? "animate-spin text-[#7B61FF]" : ""}`} />
                        <span>{mcpStatus.checking ? "Testing..." : "Check MCP Connection"}</span>
                      </button>
                      {onOpenFigjamModal && (
                        <button
                          onClick={onOpenFigjamModal}
                          className="px-3 py-1.5 bg-[#7B61FF] hover:bg-[#684FF2] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>Configure MCP</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {mcpStatus.checked && (
                    <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 animate-in fade-in ${mcpStatus.online ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                      {mcpStatus.online ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>MCP Server is running and reachable ({mcpStatus.latencyMs}ms latency)! Connect a board below to display inline.</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>MCP Server error: {mcpStatus.error || "Unable to reach server."}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* FigJam Board Linking / Creation */}
                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Connect FigJam Board to Display Inline
                    </span>
                    <a
                      href="https://figjam.new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[#7B61FF] hover:underline flex items-center gap-1"
                    >
                      <span>+ Create board at figjam.new</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Open a FigJam board (or create one at <code>figjam.new</code>), copy the link from your browser address bar, and paste it below.
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={boardUrlInput}
                      onChange={(e) => {
                        setBoardUrlInput(e.target.value);
                        if (connectError) setConnectError(null);
                      }}
                      placeholder="Paste FigJam URL (e.g. https://www.figma.com/board/...)"
                      className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7B61FF]"
                    />
                    <button
                      onClick={() => handleConnectFigjamBoard()}
                      disabled={isConnectingBoard}
                      className="px-4 py-2 bg-[#7B61FF] hover:bg-[#684FF2] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                    >
                      {isConnectingBoard ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Connecting & Syncing...</span>
                        </>
                      ) : (
                        <span>Connect & Display Inline</span>
                      )}
                    </button>
                  </div>

                  {connectError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{connectError}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            /* NON-VISUAL (TEXT-BASED) ARTEFACTS: INTERVIEWS, PERSONAS, SURVEYS, BRIEFS */
            <>
              {!hasData && !isGenerating && (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 bg-white border border-slate-200 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 mb-2.5">
                    {badgeInfo.icon}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">
                    {node.title}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
                    {upstreamSources.length > 0
                      ? `Uses inputs from ${upstreamSources.length} connected source${
                          upstreamSources.length > 1 ? "s" : ""
                        }: ${upstreamSources.map((s) => s.title).join(", ")}.`
                      : "Connect a context block or asset on the canvas to supply project inputs."}
                  </p>
                  <button
                    onClick={() => onGenerate(node.id, customGuidance)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Generate {badgeInfo.label}
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 bg-white border border-slate-200 rounded-xl">
                  <RefreshCw className="w-5 h-5 text-slate-600 animate-spin mb-3" />
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">
                    Generating {badgeInfo.label}...
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Synthesizing connected inputs and drafting content.
                  </p>
                </div>
              )}

              {hasData && !isGenerating && (
                <div className="space-y-4">
                  {/* Google Doc embed if enabled */}
                  {isTextDoc && node.googleDocId && viewMode === "google-doc" ? (
                    <div className="flex flex-col space-y-3 animate-in fade-in duration-150">
                      {/* Embedded Google Doc Toolbar */}
                      <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" />
                              <path fill="#ffffff" d="M14 2v6h6" opacity="0.4" />
                              <path fill="#ffffff" d="M8 12h8v1.5H8zm0 3h8v1.5H8zm0-6h4v1.5H8z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 truncate">Google Doc</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Live in Drive</span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">Interactive document embedded from your Google Drive</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <div className="bg-slate-100 p-0.5 rounded-lg flex items-center text-xs">
                            <button
                              onClick={() => setEmbedMode("edit")}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${embedMode === "edit" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                            >
                              Editor
                            </button>
                            <button
                              onClick={() => setEmbedMode("preview")}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${embedMode === "preview" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                            >
                              Preview
                            </button>
                          </div>

                          <a
                            href={node.googleDocUrl || `https://docs.google.com/document/d/${node.googleDocId}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Open in Docs</span>
                          </a>

                          <button
                            onClick={() => setViewMode("cards")}
                            className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors"
                          >
                            Cards View
                          </button>

                          {onCreateGoogleDoc && (
                            <button
                              onClick={() => onCreateGoogleDoc(node.id)}
                              disabled={isCreatingGoogleDoc}
                              className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors text-xs"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isCreatingGoogleDoc ? "animate-spin text-blue-600" : ""}`} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="w-full h-[620px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col relative">
                        <iframe
                          key={`${node.googleDocId}-${embedMode}`}
                          src={embedMode === "edit" ? `https://docs.google.com/document/d/${node.googleDocId}/edit?embedded=true` : `https://docs.google.com/document/d/${node.googleDocId}/preview`}
                          className="w-full flex-1 border-0 bg-white"
                          title={node.title}
                          allow="clipboard-read; clipboard-write"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Google Doc Prompt banner if available */}
                      {isTextDoc && (
                        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" />
                                <path fill="#ffffff" d="M14 2v6h6" opacity="0.4" />
                                <path fill="#ffffff" d="M8 12h8v1.5H8zm0 3h8v1.5H8zm0-6h4v1.5H8z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900">
                                {node.googleDocId ? "Google Doc Available" : "Google Doc Integration"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {node.googleDocId ? "This artefact is synced to Google Drive." : "Create a live Google Doc to view and edit this artefact inline."}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {node.googleDocId ? (
                              <button
                                onClick={() => setViewMode("google-doc")}
                                className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Switch to Embedded Doc</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => onCreateGoogleDoc?.(node.id)}
                                disabled={isCreatingGoogleDoc}
                                className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1"
                              >
                                {isCreatingGoogleDoc ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Creating Doc...</span>
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Create Google Doc</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Render text-based artifacts */}
                      {node.type === "interview-script" && (
                        <RenderInterviewScript data={node.generatedData?.data as InterviewScriptData} />
                      )}
                      {node.type === "usability-script" && (
                        <RenderUsabilityScript data={node.generatedData?.data as UsabilityScriptData} />
                      )}
                      {node.type === "user-persona" && (
                        <RenderUserPersona data={node.generatedData?.data as UserPersonaData} />
                      )}
                      {node.type === "survey-questions" && (
                        <RenderSurveyQuestions data={node.generatedData?.data as SurveyQuestionsData} />
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   Renderers for each Artefact Type
   ========================================================================== */

function RenderInterviewScript({ data }: { data: InterviewScriptData }) {
  if (!data) return null;
  return (
    <div className="space-y-5">
      {/* Overview & Audience Card */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Research Objective
          </h4>
          <p className="text-sm font-medium text-slate-800">{data.overview}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Target Audience
            </h5>
            <p className="text-xs text-slate-700">{data.targetAudience}</p>
          </div>
          <div>
            <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Screener Criteria
            </h5>
            <ul className="text-xs text-slate-700 space-y-1">
              {data.screenerCriteria?.map((crit, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{crit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Intro Script */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl">
        <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <MessageSquareQuote className="w-3.5 h-3.5 text-amber-700" />
          Verbatim Moderator Intro & Consent
        </h4>
        <p className="text-xs text-amber-900 leading-relaxed italic bg-white/70 p-3 rounded-lg border border-amber-200/50">
          &ldquo;{data.introScript}&rdquo;
        </p>
      </div>

      {/* Questions by Theme */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Thematic Question Guide ({data.sections?.length || 0} Themes)
        </h4>

        {data.sections?.map((sec, secIdx) => (
          <div
            key={secIdx}
            className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h5 className="text-sm font-bold text-slate-900">
                  Theme {secIdx + 1}: {sec.theme}
                </h5>
                <p className="text-xs text-slate-500">{sec.purpose}</p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {sec.questions?.map((q, qIdx) => (
                <div
                  key={qIdx}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2"
                >
                  <p className="text-xs font-bold text-slate-900">
                    Q{secIdx + 1}.{qIdx + 1}: {q.question}
                  </p>
                  {q.probes && q.probes.length > 0 && (
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200/60">
                      <span className="font-semibold text-blue-700">
                        Probes & Follow-ups:
                      </span>
                      <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-slate-600">
                        {q.probes.map((probe, pIdx) => (
                          <li key={pIdx}>{probe}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {q.expectedInsights && (
                    <p className="text-[10px] text-slate-500 font-medium">
                      💡 Insight target: {q.expectedInsights}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Wrap-up Script */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Debrief & Wrap-up
        </h4>
        <p className="text-xs text-slate-700 italic bg-slate-50 p-3 rounded-lg border border-slate-100">
          &ldquo;{data.wrapUpScript}&rdquo;
        </p>
      </div>
    </div>
  );
}

function RenderUsabilityScript({ data }: { data: UsabilityScriptData }) {
  if (!data) return null;
  return (
    <div className="space-y-5">
      {/* Test Objectives & Setup */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Usability Objectives
          </h4>
          <p className="text-sm font-semibold text-slate-800">{data.testObjectives}</p>
          <span className="inline-block mt-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
            {data.methodology}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <h5 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Setup & Test Materials
          </h5>
          <div className="flex flex-wrap gap-1.5">
            {data.setupAndMaterials?.map((mat, i) => (
              <span
                key={i}
                className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
              >
                • {mat}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Moderator Briefing */}
      <div className="p-4 bg-purple-50/70 border border-purple-200/80 rounded-xl">
        <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-purple-700" />
          Think-Aloud Participant Briefing Script
        </h4>
        <p className="text-xs text-purple-900 leading-relaxed italic bg-white/70 p-3 rounded-lg border border-purple-200/50">
          &ldquo;{data.moderatorBriefing}&rdquo;
        </p>
      </div>

      {/* Task Scenarios */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Interactive Task Scenarios ({data.scenarios?.length || 0})
        </h4>

        {data.scenarios?.map((scen, idx) => (
          <div
            key={idx}
            className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                Task {scen.scenarioNumber || idx + 1}: {scen.title}
              </span>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
              <span className="font-semibold text-slate-700">Context:</span>{" "}
              {scen.context}
            </p>

            <div className="p-3 bg-purple-50/40 rounded-lg border border-purple-100 text-xs">
              <span className="font-bold text-purple-900">Participant Prompt:</span>
              <p className="mt-1 font-medium text-slate-900 italic">
                &ldquo;{scen.taskPrompt}&rdquo;
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
              <div className="p-2 bg-emerald-50/50 border border-emerald-100 rounded text-emerald-900">
                <span className="font-bold block mb-0.5">Success Benchmark:</span>
                {scen.successCriteria}
              </div>
              <div className="p-2 bg-slate-100/70 border border-slate-200 rounded text-slate-700">
                <span className="font-bold block mb-0.5">Observer Notes:</span>
                {scen.observerNotes}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Metrics */}
      {data.postTaskMetrics && (
        <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Standard Post-Test Usability Metrics (SEQ & SUS)
          </h4>
          <p className="text-xs text-slate-700 font-medium">
            <strong>Single Ease Question (SEQ):</strong> {data.postTaskMetrics.seqQuestion}
          </p>
          <div className="text-xs text-slate-600 space-y-1 pt-1">
            <strong>System Usability Scale (SUS) Items:</strong>
            <ul className="list-disc list-inside space-y-0.5">
              {data.postTaskMetrics.susScaleQuestions?.map((sq, i) => (
                <li key={i}>{sq}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function RenderUserPersona({ data }: { data: UserPersonaData }) {
  if (!data) return null;
  return (
    <div className="space-y-5">
      {/* Persona Hero Card */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md shrink-0"
            style={{ backgroundColor: data.avatarColor || "#F59E0B" }}
          >
            {data.avatarInitials || "UP"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900">{data.name}</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Target Persona
              </span>
            </div>
            <p className="text-sm font-medium text-slate-600">{data.role}</p>
            <p className="text-xs text-amber-700 font-medium italic mt-0.5">
              &ldquo;{data.tagline}&rdquo;
            </p>
          </div>
        </div>

        {/* Demographics Pill Grid */}
        {data.demographics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-xs">
            <div className="p-2 bg-slate-50 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Age
              </span>
              <span className="font-semibold text-slate-800">
                {data.demographics.ageRange}
              </span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Experience
              </span>
              <span className="font-semibold text-slate-800">
                {data.demographics.experienceLevel}
              </span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Location
              </span>
              <span className="font-semibold text-slate-800">
                {data.demographics.locationOrContext}
              </span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Tech Comfort
              </span>
              <span className="font-semibold text-slate-800">
                {data.demographics.techComfort}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Quote Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
        <p className="text-sm font-semibold text-amber-950 italic">
          &ldquo;{data.coreQuote}&rdquo;
        </p>
      </div>

      {/* Bio */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Background & Context
        </h4>
        <p className="text-xs text-slate-700 leading-relaxed">{data.bio}</p>
      </div>

      {/* Goals vs Frustrations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-2">
          <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Core Goals & Motivations
          </h4>
          <ul className="text-xs text-emerald-950 space-y-1.5">
            {data.goals?.map((g, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-emerald-600 font-bold">•</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200/80 space-y-2">
          <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            Friction & Pain Points
          </h4>
          <ul className="text-xs text-rose-950 space-y-1.5">
            {data.frustrations?.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-rose-600 font-bold">•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Behaviors & Tools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Daily Habits & Behaviors
          </h4>
          <ul className="text-xs text-slate-700 space-y-1">
            {data.behaviors?.map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Tool Stack & Channels
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {data.toolsAndEnvironment?.map((tool, i) => (
              <span
                key={i}
                className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-mono"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RenderUserFlow({ data }: { data: UserFlowData }) {
  if (!data) return null;
  return (
    <div className="space-y-5">
      {/* Header Info */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">{data.title}</h4>
          <span className="text-[11px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
            {data.nodes?.length || 0} Steps
          </span>
        </div>
        <p className="text-xs text-slate-600">
          <strong>User Goal:</strong> {data.userGoal}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 text-slate-500">
          <div>
            <strong className="text-slate-700">Trigger:</strong> {data.startTrigger}
          </div>
          <div>
            <strong className="text-slate-700">Outcome:</strong> {data.endOutcome}
          </div>
        </div>
      </div>

      {/* Sequence Overview */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <GitFork className="w-3.5 h-3.5 text-[#7B61FF]" />
            User Flow Sequence & Logic Steps
          </h5>
          <span className="text-[11px] text-slate-500">
            {data.nodes?.length || 0} interaction points
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {data.nodes?.map((step, idx) => (
            <div
              key={step.id || idx}
              className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-[#7B61FF]/40 transition-all text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between text-[10px] font-semibold">
                <span className="text-[#7B61FF]">Step {step.stepNumber || idx + 1}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 uppercase font-mono text-[9px]">
                  {step.type}
                </span>
              </div>
              <h6 className="font-bold text-slate-900">{step.label}</h6>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                {step.description}
              </p>
              {step.systemResponse && (
                <div className="pt-1 border-t border-slate-200/60 text-[10px] text-slate-500">
                  <span className="font-medium text-slate-700">System:</span> {step.systemResponse}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Step Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
          Sequence Specifications & Edge Cases
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {data.nodes?.map((node, i) => (
            <div key={node.id || i} className="p-3 hover:bg-slate-50/50 flex flex-col sm:flex-row gap-2">
              <div className="sm:w-36 shrink-0">
                <span className="font-bold text-slate-900 block">
                  {node.stepNumber || i + 1}. {node.label}
                </span>
                <span className="text-[10px] uppercase font-mono text-slate-400">
                  {node.type}
                </span>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-slate-700">{node.description}</p>
                <p className="text-slate-500 text-[11px]">
                  <strong>System Action:</strong> {node.systemResponse}
                </p>
                {node.edgeCaseNote && (
                  <p className="text-amber-700 text-[11px] bg-amber-50 p-1.5 rounded">
                    ⚠️ {node.edgeCaseNote}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RenderUserJourneyMap({ data }: { data: UserJourneyMapData }) {
  if (!data) return null;

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return <Smile className="w-3.5 h-3.5 text-emerald-600" />;
      case "negative":
        return <Frown className="w-3.5 h-3.5 text-rose-600" />;
      default:
        return <Meh className="w-3.5 h-3.5 text-amber-600" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
        <h4 className="text-sm font-bold text-slate-900">{data.title}</h4>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>
            <strong>Persona:</strong> {data.personaName}
          </span>
          <span>•</span>
          <span>
            <strong>Scenario:</strong> {data.scenario}
          </span>
        </div>
      </div>

      {/* Multi-Phase Journey Table */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {data.phases?.map((phase, pIdx) => (
            <div
              key={pIdx}
              className="w-72 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden shrink-0"
            >
              {/* Phase Header */}
              <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    Phase {pIdx + 1}
                  </span>
                  <h5 className="font-bold text-xs">{phase.phaseName}</h5>
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                    phase.sentiment === "positive"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : phase.sentiment === "negative"
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {getSentimentIcon(phase.sentiment)}
                  <span>{phase.sentimentScore}/5</span>
                </div>
              </div>

              <div className="p-3 space-y-3 flex-1 flex flex-col text-xs">
                {/* User Actions */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Actions & Touchpoints
                  </span>
                  <ul className="space-y-1 text-slate-700">
                    {phase.userActions?.map((act, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-blue-500 font-bold">•</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                  {phase.touchpoints && phase.touchpoints.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {phase.touchpoints.map((tp, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded"
                        >
                          {tp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* User Thoughts */}
                <div className="p-2 bg-blue-50/50 rounded-lg border border-blue-100 italic text-[11px] text-blue-900">
                  💭 &ldquo;{phase.userThoughts}&rdquo;
                </div>

                {/* Pain Points */}
                <div className="p-2 bg-rose-50/60 rounded-lg border border-rose-100 text-[11px] text-rose-950">
                  <span className="font-bold text-rose-800 block mb-0.5">
                    Friction Points:
                  </span>
                  <ul className="space-y-0.5">
                    {phase.painPoints?.map((pp, i) => (
                      <li key={i}>• {pp}</li>
                    ))}
                  </ul>
                </div>

                {/* Opportunities */}
                <div className="p-2 bg-emerald-50/60 rounded-lg border border-emerald-100 text-[11px] text-emerald-950 mt-auto">
                  <span className="font-bold text-emerald-800 block mb-0.5">
                    Design Opportunities:
                  </span>
                  <ul className="space-y-0.5">
                    {phase.opportunities?.map((op, i) => (
                      <li key={i}>✨ {op}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategic Takeaways */}
      {data.strategicTakeaways && (
        <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Strategic Takeaways
          </h4>
          <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
            {data.strategicTakeaways.map((takeaway, i) => (
              <li key={i}>{takeaway}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RenderWireframe({
  data,
  selectedScreenType,
  onSelectScreenType,
  selectedStateIndex,
  onSelectStateIndex,
}: {
  data: WireframeData;
  selectedScreenType: "mobile" | "web-desktop" | "tablet";
  onSelectScreenType: (type: "mobile" | "web-desktop" | "tablet") => void;
  selectedStateIndex: number;
  onSelectStateIndex: (idx: number) => void;
}) {
  if (!data) return null;

  const currentState =
    data.interactiveStates && data.interactiveStates[selectedStateIndex];

  return (
    <div className="space-y-5">
      {/* Screen Type & State Selector Bar */}
      <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => onSelectScreenType("web-desktop")}
            className={`px-2.5 py-1 rounded flex items-center gap-1 font-medium transition-colors ${
              selectedScreenType === "web-desktop"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Web Desktop</span>
          </button>
          <button
            onClick={() => onSelectScreenType("tablet")}
            className={`px-2.5 py-1 rounded flex items-center gap-1 font-medium transition-colors ${
              selectedScreenType === "tablet"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span>Tablet</span>
          </button>
          <button
            onClick={() => onSelectScreenType("mobile")}
            className={`px-2.5 py-1 rounded flex items-center gap-1 font-medium transition-colors ${
              selectedScreenType === "mobile"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile</span>
          </button>
        </div>

        {/* State variants switcher */}
        {data.interactiveStates && data.interactiveStates.length > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 text-[11px] font-medium mr-1">
              State:
            </span>
            {data.interactiveStates.map((st, i) => (
              <button
                key={i}
                onClick={() => onSelectStateIndex(i)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  selectedStateIndex === i
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st.stateName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rendered Wireframe Canvas */}
      <div
        className={`mx-auto bg-white border-2 border-slate-300 rounded-2xl shadow-md overflow-hidden transition-all ${
          selectedScreenType === "mobile"
            ? "max-w-sm"
            : selectedScreenType === "tablet"
            ? "max-w-xl"
            : "max-w-full"
        }`}
      >
        {/* Wireframe Browser Header */}
        <div className="bg-slate-100 border-b border-slate-200 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="ml-2 text-[10px] font-mono text-slate-400">
              {data.screenTitle || "Screen Mockup"}
            </span>
          </div>
          <div className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-500 font-mono">
            low-fi wireframe
          </div>
        </div>

        {/* Wireframe App Content */}
        <div className="p-4 space-y-4 font-sans bg-slate-50/30 min-h-[380px]">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-white font-bold text-xs">
                M
              </div>
              <span className="font-bold text-sm text-slate-900">
                {data.layoutStructure?.header?.title || "Product App"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {data.layoutStructure?.header?.actions?.map((act, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-600 font-medium"
                >
                  {act}
                </span>
              ))}
            </div>
          </div>

          {/* Hero / Summary Stats */}
          {data.layoutStructure?.heroOrSummary && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h6 className="font-bold text-xs text-slate-900">
                    {data.layoutStructure.heroOrSummary.title}
                  </h6>
                  <p className="text-[11px] text-slate-500">
                    {data.layoutStructure.heroOrSummary.subtitle}
                  </p>
                </div>
              </div>

              {data.layoutStructure.heroOrSummary.stats && (
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                  {data.layoutStructure.heroOrSummary.stats.map((st, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded">
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {st.label}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {st.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Main Sections */}
          <div className="space-y-3">
            {data.layoutStructure?.mainSections?.map((section, sIdx) => (
              <div
                key={sIdx}
                className="p-3 bg-white border border-slate-200 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800">
                    {section.sectionTitle}
                  </span>
                  <span className="text-[10px] uppercase font-mono text-slate-400 bg-slate-100 px-1 rounded">
                    {section.contentType}
                  </span>
                </div>

                {/* Items preview inside section */}
                <div className="grid grid-cols-1 gap-2">
                  {section.items?.map((item, itIdx) => (
                    <div
                      key={itIdx}
                      className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-100 flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="text-xs font-semibold text-slate-900 block">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="text-[11px] text-slate-500 block">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                      {item.badge && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded">
                          {item.badge}
                        </span>
                      )}
                      {item.action && (
                        <button className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded">
                          {item.action}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Bar */}
          {data.layoutStructure?.footerOrBottomBar && (
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
              {data.layoutStructure.footerOrBottomBar.actions?.map((act, i) => (
                <span key={i} className="hover:text-slate-600">
                  {act}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* State Differences & UI Specs */}
      {currentState && (
        <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs space-y-2">
          <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
            <span>State Description: {currentState.stateName}</span>
          </h5>
          <p className="text-slate-600">{currentState.description}</p>
          {currentState.keyDifferences && (
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              {currentState.keyDifferences.map((kd, i) => (
                <li key={i}>{kd}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Design System Notes */}
      {data.designNotes && (
        <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs space-y-2">
          <h5 className="font-bold text-slate-800">UI Architecture Notes</h5>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600">
            {data.designNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RenderSurveyQuestions({ data }: { data: SurveyQuestionsData }) {
  if (!data) return null;
  return (
    <div className="space-y-5">
      {/* Objective & Meta */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <h4 className="text-sm font-bold text-slate-900">{data.title}</h4>
        <p className="text-xs text-slate-700">{data.objective}</p>
        <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
          <span>
            <strong>Target:</strong> {data.targetRespondent}
          </span>
          <span>•</span>
          <span>
            <strong>Estimated duration:</strong> ~{data.estimatedMinutes || 5} min
          </span>
        </div>
      </div>

      {/* Intro Note */}
      {data.introNote && (
        <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl text-xs text-teal-900 italic">
          &ldquo;{data.introNote}&rdquo;
        </div>
      )}

      {/* Questionnaire */}
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Survey Instrument ({data.questions?.length || 0} Questions)
        </h5>

        {data.questions?.map((q, idx) => (
          <div
            key={q.id || idx}
            className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold text-slate-900">
                {q.number || idx + 1}. {q.question}{" "}
                {q.required && <span className="text-rose-500">*</span>}
              </span>
              <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded shrink-0">
                {q.type}
              </span>
            </div>

            {/* Answer Options by Question Type */}
            {q.type === "single-choice" && q.options && (
              <div className="space-y-1.5 text-xs text-slate-700">
                {q.options.map((opt, oIdx) => (
                  <label
                    key={oIdx}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/60 cursor-pointer"
                  >
                    <input type="radio" name={`q-${q.id}`} className="text-teal-600" />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === "multiple-choice" && q.options && (
              <div className="space-y-1.5 text-xs text-slate-700">
                {q.options.map((opt, oIdx) => (
                  <label
                    key={oIdx}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100/60 cursor-pointer"
                  >
                    <input type="checkbox" className="text-teal-600 rounded" />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === "likert-scale" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{q.scaleMinLabel || "1 - Strongly Disagree"}</span>
                  <span>{q.scaleMaxLabel || "5 - Strongly Agree"}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      key={val}
                      className="py-2 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors"
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {q.type === "nps" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>0 - Not at all likely</span>
                  <span>10 - Extremely likely</span>
                </div>
                <div className="grid grid-cols-11 gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      className="py-1.5 bg-slate-50 hover:bg-teal-600 hover:text-white border border-slate-200 rounded text-[11px] font-bold text-slate-700 transition-colors"
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {q.type === "open-text" && (
              <textarea
                disabled
                rows={2}
                placeholder="Participant types response here..."
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 italic resize-none"
              />
            )}

            {q.purposeRationale && (
              <div className="text-[10px] text-slate-400 bg-slate-50/50 p-1.5 rounded flex items-center justify-between">
                <span>🎯 Measurement goal: {q.purposeRationale}</span>
                {q.logicRule && (
                  <span className="text-amber-600 font-mono">
                    Branch: {q.logicRule}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.closingNote && (
        <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 italic">
          &ldquo;{data.closingNote}&rdquo;
        </div>
      )}
    </div>
  );
}
