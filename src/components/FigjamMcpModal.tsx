/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Server,
  CheckCircle2,
  AlertCircle,
  Activity,
  Terminal,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Layers,
  Wrench,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  pingFigjamMcpServer,
  getMcpLogs,
  subscribeToMcpLogs,
  callFigjamMcpTool,
} from "../services/figjamMcpService";
import { FigjamMcpToolCallLog } from "../types/artefacts";

interface FigjamMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotification?: (msg: string) => void;
}

export const FigjamMcpModal: React.FC<FigjamMcpModalProps> = ({
  isOpen,
  onClose,
  onNotification,
}) => {
  const [activeTab, setActiveTab] = useState<"status" | "tools" | "logs">("status");
  const [isPinging, setIsPinging] = useState(false);
  const [pingStatus, setPingStatus] = useState<{
    online: boolean;
    latencyMs: number;
    serverInfo?: string;
  } | null>(null);

  const [figmaToken, setFigmaToken] = useState<string>(() => {
    return localStorage.getItem("kickstart_figma_token") || "";
  });
  const [defaultBoard, setDefaultBoard] = useState<string>(() => {
    return localStorage.getItem("kickstart_default_figjam_board") || "";
  });
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);

  const [logs, setLogs] = useState<FigjamMcpToolCallLog[]>(getMcpLogs());
  const [isTestingTool, setIsTestingTool] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Ping on open
    handlePing();
    const unsub = subscribeToMcpLogs((newLogs) => setLogs(newLogs));
    return () => unsub();
  }, [isOpen]);

  const handlePing = async () => {
    setIsPinging(true);
    const result = await pingFigjamMcpServer();
    setPingStatus(result);
    setIsPinging(false);
  };

  const handleSaveSettings = () => {
    localStorage.setItem("kickstart_figma_token", figmaToken.trim());
    localStorage.setItem("kickstart_default_figjam_board", defaultBoard.trim());
    setSavedSettingsSuccess(true);
    setTimeout(() => setSavedSettingsSuccess(false), 2000);
    onNotification?.("Saved FigJam MCP connection settings");
  };

  const handleTestTool = async () => {
    setIsTestingTool(true);
    try {
      await callFigjamMcpTool("figjam_ping", {});
      onNotification?.("MCP tool test executed successfully");
    } catch (err: any) {
      onNotification?.(`MCP tool error: ${err?.message}`);
    } finally {
      setIsTestingTool(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="p-4 sm:px-6 bg-gradient-to-r from-purple-50 via-white to-pink-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B61FF] text-white flex items-center justify-center shadow-md">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.5 8.5C5.5 6.84315 6.84315 5.5 8.5 5.5H12V12H8.5C6.84315 12 5.5 10.6569 5.5 8.5Z" />
                <path d="M12 5.5H15.5C17.1569 5.5 18.5 6.84315 18.5 8.5C18.5 10.6569 17.1569 12 15.5 12H12V5.5Z" />
                <path d="M5.5 15.5C5.5 13.8431 6.84315 12.5 8.5 12.5H12V19H8.5C6.84315 19 5.5 17.6569 5.5 15.5Z" />
                <circle cx="15.5" cy="15.5" r="3.5" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  FigJam MCP Connection
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Protocol Active</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Model Context Protocol (JSON-RPC 2.0) for generating visual FigJam artefacts
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 px-6 gap-6 bg-white text-xs font-medium">
          <button
            onClick={() => setActiveTab("status")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "status"
                ? "border-[#7B61FF] text-[#7B61FF] font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Connection & Token</span>
          </button>
          <button
            onClick={() => setActiveTab("tools")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "tools"
                ? "border-[#7B61FF] text-[#7B61FF] font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>MCP Tools (4)</span>
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "logs"
                ? "border-[#7B61FF] text-[#7B61FF] font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Protocol Call Log ({logs.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-4">
          {/* TAB 1: Status & Settings */}
          {activeTab === "status" && (
            <div className="space-y-4">
              {/* Server Status Card */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-[#7B61FF] flex items-center justify-center">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        MCP Server Status
                      </h4>
                      <p className="text-[11px] text-slate-500 font-mono">
                        POST /api/mcp/figjam
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {pingStatus && (
                      <span className="text-xs font-mono text-slate-500">
                        {pingStatus.latencyMs}ms roundtrip
                      </span>
                    )}
                    <button
                      onClick={handlePing}
                      disabled={isPinging}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isPinging ? "animate-spin" : ""}`}
                      />
                      <span>Test Ping</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] text-slate-400 block font-medium">
                      Protocol
                    </span>
                    <span className="font-semibold text-slate-800">
                      JSON-RPC 2.0
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] text-slate-400 block font-medium">
                      MCP Version
                    </span>
                    <span className="font-semibold text-slate-800">
                      2024-11-05
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] text-slate-400 block font-medium">
                      Available Tools
                    </span>
                    <span className="font-semibold text-slate-800">
                      3 Artefact Tools
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] text-slate-400 block font-medium">
                      Live State
                    </span>
                    <span className="font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Default FigJam Board Configuration */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-[#7B61FF] flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Default FigJam Board (Optional)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Board URL or file key to automatically embed and display visual artefacts inline
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://figjam.new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#7B61FF] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>+ Create at figjam.new</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={defaultBoard}
                    onChange={(e) => setDefaultBoard(e.target.value)}
                    placeholder="https://www.figma.com/board/..."
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-[#7B61FF] focus:bg-white transition-all"
                  />
                  <p className="text-[11px] text-slate-500">
                    Paste any FigJam board URL. When you generate a Wireframe, Journey Map, or User Flow, it will link and display this board inline.
                  </p>
                </div>
              </div>

              {/* Figma Access Token Configuration */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        FIGMA_ACCESS_TOKEN (Personal Access Token)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Used by MCP to read and write directly to your Figma account
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://www.figma.com/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#7B61FF] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Figma Settings</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-2">
                  <input
                    type="password"
                    value={figmaToken}
                    onChange={(e) => setFigmaToken(e.target.value)}
                    placeholder="figd_... (Figma Personal Access Token)"
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-[#7B61FF] focus:bg-white transition-all"
                  />
                  <div className="p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-600 space-y-1">
                    <span className="font-semibold text-slate-800 block">How to get your FIGMA_ACCESS_TOKEN:</span>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
                      <li>In Figma, click your profile icon in the top left &rarr; <strong>Settings</strong></li>
                      <li>Scroll down to <strong>Personal access tokens</strong></li>
                      <li>Click <strong>Generate new token</strong>, give it file read/write permissions</li>
                      <li>Copy the token (starts with <code className="text-[#7B61FF]">figd_</code>) and paste it here</li>
                    </ol>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    {savedSettingsSuccess && (
                      <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Saved configuration</span>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    className="px-3.5 py-1.5 bg-[#7B61FF] hover:bg-[#684FF2] text-white text-xs font-medium rounded-lg transition-colors shadow-2xs"
                  >
                    Save Settings
                  </button>
                </div>
              </div>

              {/* Quick Test Call Button */}
              <div className="p-3.5 bg-purple-50/60 border border-purple-200/60 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-purple-900">
                    Verify MCP Protocol Handshake
                  </h4>
                  <p className="text-[11px] text-purple-700">
                    Send a test JSON-RPC 2.0 tool execution request to confirm server readiness
                  </p>
                </div>
                <button
                  onClick={handleTestTool}
                  disabled={isTestingTool}
                  className="px-3 py-1.5 bg-white border border-purple-300 text-purple-800 hover:bg-purple-100/70 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-[#7B61FF]" />
                  <span>{isTestingTool ? "Testing..." : "Test Protocol"}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Registered MCP Tools */}
          {activeTab === "tools" && (
            <div className="space-y-3">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#7B61FF] uppercase">
                      Tool: figjam_create_wireframe
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-0.5">
                      Wireframe & Layout Board Generator
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Constructs responsive artboard device frames (mobile or desktop), application top bars, interactive section blocks, and design annotation sticky notes.
                    </p>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                    Wireframe
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#7B61FF] uppercase">
                      Tool: figjam_create_journey_map
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-0.5">
                      Customer Journey Map Board Generator
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Generates horizontal lifecycle phase columns, persona cards, emotional sentiment fluctuation scores, action stickies, touchpoint badges, and opportunity cards.
                    </p>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                    Journey Map
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#7B61FF] uppercase">
                      Tool: figjam_create_user_flow
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-0.5">
                      User Flow Diagram & Branching Generator
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Draws start/end capsules, action rectangles, decision diamonds (rotated 45°), labeled connector lines, and edge-case sticky notes.
                    </p>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                    User Flow
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#7B61FF] uppercase">
                      Tool: figjam_ping
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 mt-0.5">
                      Connection Handshake & Ping
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Verifies server availability and roundtrip latency for FigJam MCP commands.
                    </p>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                    Utility
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Protocol Logs */}
          {activeTab === "logs" && (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
                  No MCP tool calls executed yet. Generate a Wireframe, Journey Map, or User Flow to inspect requests!
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            log.status === "success"
                              ? "bg-emerald-400"
                              : "bg-rose-400"
                          }`}
                        />
                        <span className="font-semibold text-white">
                          tools/call: {log.toolName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{log.durationMs}ms</span>
                        <span>{log.timestamp.slice(11, 19)}</span>
                      </div>
                    </div>
                    <div className="text-slate-300">
                      <span className="text-slate-500">params: </span>
                      {JSON.stringify(log.params)}
                    </div>
                    {log.error ? (
                      <div className="text-rose-400">
                        <span className="text-rose-500">error: </span>
                        {log.error}
                      </div>
                    ) : (
                      <div className="text-emerald-400">
                        <span className="text-emerald-600">status: </span>
                        200 OK (Generated FigJam elements)
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 px-6 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>FigJam MCP Protocol Ready</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
