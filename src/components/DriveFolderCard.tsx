/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  RefreshCw,
  ExternalLink,
  Trash2,
  CopyPlus,
  Eye,
  X,
  FileText,
  Search,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Presentation,
  File,
  ChevronDown,
} from "lucide-react";
import { CanvasNode, UploadedDocument, DriveFolderFileItem } from "../types/artefacts";
import {
  extractDriveFolderId,
  getDriveFolderDetails,
  listRecentDriveFolders,
  syncDriveFolderFiles,
  DriveFolderInfo,
} from "../services/googleDriveService";

interface DriveFolderCardProps {
  node: CanvasNode;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onStartConnection: (e: React.MouseEvent) => void;
  onCompleteConnection: (e: React.MouseEvent) => void;
  isConnecting: boolean;
  isCurrentConnectingSource: boolean;
  googleAccessToken?: string | null;
  onGoogleSignIn?: () => Promise<string | null>;
}

export const DriveFolderCard: React.FC<DriveFolderCardProps> = ({
  node,
  onUpdateNode,
  onRemoveNode,
  onDuplicateNode,
  onDragStart,
  onStartConnection,
  onCompleteConnection,
  isConnecting,
  isCurrentConnectingSource,
  googleAccessToken,
  onGoogleSignIn,
}) => {
  const [folderInput, setFolderInput] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);

  // Folder picker modal / popover state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [recentFolders, setRecentFolders] = useState<DriveFolderInfo[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");

  const documents = node.documents || [];
  const folderId = node.driveFolderId;
  const folderName = node.driveFolderName;
  const folderUrl =
    node.driveFolderUrl || (folderId ? `https://drive.google.com/drive/folders/${folderId}` : "");

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string, name: string) => {
    if (
      mimeType.includes("document") ||
      mimeType.includes("text") ||
      /\.(md|txt|docx|doc)$/i.test(name)
    ) {
      return <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
    if (
      mimeType.includes("spreadsheet") ||
      mimeType.includes("csv") ||
      /\.(csv|xlsx|xls)$/i.test(name)
    ) {
      return <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
    if (
      mimeType.includes("presentation") ||
      /\.(pptx|ppt|key)$/i.test(name)
    ) {
      return <Presentation className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
    return <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  // Perform sync of files for a given folder ID
  const performSync = async (targetFolderId: string, customToken?: string) => {
    const token = customToken || googleAccessToken;
    if (!token) {
      setErrorMsg("Please sign in with Google to access Drive folders.");
      return;
    }

    setIsSyncing(true);
    setErrorMsg(null);
    setSyncProgress("Connecting to Drive folder...");

    try {
      const syncResult = await syncDriveFolderFiles(
        targetFolderId,
        token,
        (current, total, file) => {
          setSyncProgress(`Importing (${current}/${total}): ${file.slice(0, 20)}...`);
        }
      );

      const driveFolderFiles: DriveFolderFileItem[] = syncResult.files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        iconLink: f.iconLink,
      }));

      onUpdateNode(node.id, {
        title: node.title === "Google Drive Folder" || !node.title ? syncResult.folderInfo.name : node.title,
        driveFolderId: syncResult.folderInfo.id,
        driveFolderName: syncResult.folderInfo.name,
        driveFolderUrl:
          syncResult.folderInfo.webViewLink ||
          `https://drive.google.com/drive/folders/${syncResult.folderInfo.id}`,
        driveFolderFiles,
        documents: syncResult.documents,
        driveLastSyncedAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });

      setFolderInput("");
      setShowFolderPicker(false);
      setSyncProgress("");
    } catch (err: any) {
      console.error("Error syncing Google Drive folder:", err);
      setErrorMsg(err?.message || "Failed to sync Google Drive folder.");
    } finally {
      setIsSyncing(false);
      setSyncProgress("");
    }
  };

  // Handle URL / ID manual submission
  const handleConnectFolderByInput = async () => {
    if (!folderInput.trim()) return;

    let token = googleAccessToken;
    if (!token && onGoogleSignIn) {
      token = await onGoogleSignIn();
    }
    if (!token) {
      setErrorMsg("Google sign in required to read Drive folders.");
      return;
    }

    const parsedId = extractDriveFolderId(folderInput.trim());
    if (!parsedId) {
      setErrorMsg("Could not detect a valid Google Drive folder URL or ID.");
      return;
    }

    await performSync(parsedId, token);
  };

  // Fetch recent folders to browse
  const handleOpenFolderPicker = async () => {
    let token = googleAccessToken;
    if (!token && onGoogleSignIn) {
      token = await onGoogleSignIn();
    }
    if (!token) {
      setErrorMsg("Please sign in with Google to browse folders.");
      return;
    }

    setShowFolderPicker(true);
    setIsLoadingFolders(true);
    setErrorMsg(null);

    try {
      const folders = await listRecentDriveFolders(token, folderSearch);
      setRecentFolders(folders);
    } catch (err: any) {
      console.error("Failed to list recent folders:", err);
      setErrorMsg(err?.message || "Could not list Drive folders.");
    } finally {
      setIsLoadingFolders(false);
    }
  };

  // Search within recent folders
  useEffect(() => {
    if (!showFolderPicker || !googleAccessToken) return;
    const timer = setTimeout(async () => {
      setIsLoadingFolders(true);
      try {
        const folders = await listRecentDriveFolders(googleAccessToken, folderSearch);
        setRecentFolders(folders);
      } catch (err) {
        console.warn(err);
      } finally {
        setIsLoadingFolders(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [folderSearch, showFolderPicker, googleAccessToken]);

  const handleDisconnectFolder = () => {
    onUpdateNode(node.id, {
      driveFolderId: undefined,
      driveFolderName: undefined,
      driveFolderUrl: undefined,
      driveFolderFiles: [],
      documents: [],
      driveLastSyncedAt: undefined,
    });
    setPreviewDoc(null);
  };

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className="relative bg-white rounded-xl border border-slate-300 shadow-sm hover:border-slate-400 transition-colors"
    >
      {/* Input Port Connector Handle (Left side to chain upstream) */}
      <div
        onMouseUp={onCompleteConnection}
        title="Connect upstream block here"
        className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-xs flex items-center justify-center transition-all z-10 ${
          isConnecting && !isCurrentConnectingSource
            ? "bg-slate-700 scale-110 cursor-pointer"
            : "bg-slate-300 hover:bg-slate-500 cursor-pointer"
        }`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
      </div>

      {/* Output Port Connector Handle (Right side - passes all folder files into downstream design artefacts) */}
      <div
        onMouseDown={onStartConnection}
        title="Drag wire to connect Drive folder files into downstream assets"
        className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-700 border-2 border-white shadow-xs flex items-center justify-center cursor-crosshair hover:bg-slate-900 transition-colors z-10"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
      </div>

      {/* Header */}
      <div
        onMouseDown={onDragStart}
        className="p-2.5 bg-slate-50 border-b border-slate-200 rounded-t-xl flex items-center justify-between cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Folder className="w-3.5 h-3.5 text-slate-700 shrink-0" />

          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
            className="text-xs font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-600 focus:bg-white focus:outline-none px-1 rounded transition-colors w-full truncate"
            placeholder="Drive Folder Title"
          />

          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0 uppercase tracking-wider">
            Drive Folder
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            onClick={() => onDuplicateNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
            title="Duplicate folder block"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemoveNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
            title="Delete folder block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        {/* Error notification */}
        {errorMsg && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <span className="flex-1 leading-tight">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-400 hover:text-red-700"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* State 1: Folder Not Connected Yet */}
        {!folderId ? (
          <div className="space-y-2.5">
            <p className="text-[11px] text-slate-600 leading-snug">
              Add a Google Drive folder as an input to automatically import briefs, transcripts, and research documents.
            </p>

            {/* Quick URL / Folder ID input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Paste Folder Link or ID
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConnectFolderByInput();
                    }
                  }}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-600 focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={handleConnectFolderByInput}
                  disabled={!folderInput.trim() || isSyncing}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-medium transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {isSyncing ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  <span>Connect</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <div className="h-px bg-slate-200 flex-1" />
              <span className="text-[10px] text-slate-400 font-mono">OR</span>
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            {/* Browse user's Drive folders */}
            <button
              type="button"
              onClick={handleOpenFolderPicker}
              className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
              <span>Browse Your Drive Folders</span>
            </button>
          </div>
        ) : (
          /* State 2: Folder Connected and Synced */
          <div className="space-y-2.5">
            {/* Active Folder Header Banner */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <Folder className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-900 truncate">
                      {folderName || "Connected Drive Folder"}
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      {documents.length} file{documents.length === 1 ? "" : "s"} synced into canvas
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {folderUrl && (
                    <a
                      href={folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                      title="Open folder in Google Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => performSync(folderId)}
                    disabled={isSyncing}
                    className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Re-sync folder files"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-slate-600" : ""}`}
                    />
                  </button>
                  <button
                    onClick={handleDisconnectFolder}
                    className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                    title="Disconnect folder"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {node.driveLastSyncedAt && (
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-200/60 font-mono">
                  <span>Synced: {node.driveLastSyncedAt}</span>
                  <span className="text-slate-600 font-sans font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    Input Active
                  </span>
                </div>
              )}
            </div>

            {/* Synced files list */}
            {documents.length > 0 ? (
              <div
                onWheel={(e) => e.stopPropagation()}
                className="space-y-1 max-h-36 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100 pt-1"
              >
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-slate-50 text-[11px] group"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {getFileIcon(doc.mimeType, doc.name)}
                      <span className="truncate text-slate-700 font-medium">
                        {doc.name}
                      </span>
                      {doc.size ? (
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums font-mono">
                          {formatBytes(doc.size)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {doc.textContent && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc(previewDoc?.id === doc.id ? null : doc)
                          }
                          className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                          title="Preview text content"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-slate-400 text-[11px] bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                <p>No files found inside this Drive folder yet.</p>
                <button
                  onClick={() => performSync(folderId)}
                  className="mt-1 text-slate-600 hover:text-slate-900 hover:underline font-medium text-[11px]"
                >
                  Refresh folder
                </button>
              </div>
            )}

            {/* Syncing progress indicator */}
            {isSyncing && (
              <div className="flex items-center gap-2 text-[11px] text-slate-700 bg-slate-100 p-2 rounded-lg border border-slate-200">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-slate-600" />
                <span className="truncate">{syncProgress || "Syncing Drive folder..."}</span>
              </div>
            )}

            {/* Text excerpt preview */}
            {previewDoc && previewDoc.textContent && (
              <div
                onWheel={(e) => e.stopPropagation()}
                className="p-2 bg-slate-900 text-slate-100 rounded-lg text-[10px] font-mono mt-1 relative"
              >
                <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-700 text-[11px] font-sans font-medium text-slate-300">
                  <span className="truncate">{previewDoc.name}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="text-slate-400 hover:text-white ml-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <pre className="whitespace-pre-wrap max-h-24 overflow-y-auto no-scrollbar">
                  {previewDoc.textContent.slice(0, 400)}
                  {previewDoc.textContent.length > 400 ? "..." : ""}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal / Popover: Folder Picker Dialog */}
      {showFolderPicker && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                  <Folder className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Select Google Drive Folder
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Choose a folder from your Google Drive
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFolderPicker(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search filter */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  placeholder="Search folders by name..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-600 focus:bg-white"
                />
              </div>
            </div>

            {/* Folder List */}
            <div
              onWheel={(e) => e.stopPropagation()}
              className="max-h-64 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100"
            >
              {isLoadingFolders ? (
                <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                  <span>Loading your Google Drive folders...</span>
                </div>
              ) : recentFolders.length > 0 ? (
                recentFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => performSync(f.id)}
                    className="w-full p-2.5 rounded-lg hover:bg-slate-50 text-left flex items-center justify-between gap-2 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Folder className="w-4 h-4 text-slate-600 shrink-0 group-hover:scale-110 transition-transform" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate group-hover:text-slate-900">
                          {f.name}
                        </span>
                        {f.modifiedTime && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Modified {new Date(f.modifiedTime).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 bg-slate-100 group-hover:bg-slate-200 px-2 py-0.5 rounded transition-colors shrink-0">
                      Select
                    </span>
                  </button>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <p>No Google Drive folders found.</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Try pasting the folder URL directly above.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">
                Or paste a link directly in the card
              </span>
              <button
                type="button"
                onClick={() => setShowFolderPicker(false)}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
