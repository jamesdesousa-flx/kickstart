/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ArtefactType, FigjamMcpToolCallLog } from "../types/artefacts";
import { apiFetch } from "./authService";

// In-memory MCP call log for the UI inspector
const mcpLogs: FigjamMcpToolCallLog[] = [];
type LogListener = (logs: FigjamMcpToolCallLog[]) => void;
const logListeners = new Set<LogListener>();

export function subscribeToMcpLogs(listener: LogListener): () => void {
  logListeners.add(listener);
  listener([...mcpLogs]);
  return () => logListeners.delete(listener);
}

function recordMcpLog(log: FigjamMcpToolCallLog) {
  mcpLogs.unshift(log);
  if (mcpLogs.length > 50) mcpLogs.pop();
  logListeners.forEach((l) => l([...mcpLogs]));
}

export function getMcpLogs(): FigjamMcpToolCallLog[] {
  return [...mcpLogs];
}

/**
 * Extracts a Figma / FigJam file key from any URL or string
 */
export function extractFigmaFileKey(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Try standard URL parsing first
  try {
    const urlStr = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlStr);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const typeIdx = segments.findIndex((s) =>
      ["board", "file", "design", "community"].includes(s.toLowerCase())
    );
    if (typeIdx !== -1) {
      if (segments[typeIdx].toLowerCase() === "community" && segments[typeIdx + 1]?.toLowerCase() === "file") {
        if (segments[typeIdx + 2]) return segments[typeIdx + 2];
      } else if (segments[typeIdx + 1]) {
        return segments[typeIdx + 1];
      }
    }
  } catch {
    // Continue to regex checks
  }

  // Regex for figma.com/(board|file|design)/:key or embed.figma.com/...
  const match = trimmed.match(
    /(?:figma\.com|embed\.figma\.com)\/(?:board|file|design|community\/file)\/([a-zA-Z0-9_-]+)/i
  );
  if (match && match[1]) return match[1];

  // Raw file key (alphanumeric with hyphens/underscores)
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleaned.length >= 8 && cleaned.length <= 64) {
    return cleaned;
  }

  return null;
}

// The FigJam file of the open project. Every visual artefact in a project draws into this file.
let activeProjectFigjamKey = "";

export function getDefaultFigjamBoard(): string {
  return activeProjectFigjamKey;
}

export function setActiveProjectFigjamBoard(keyOrUrl: string) {
  activeProjectFigjamKey = extractFigmaFileKey(keyOrUrl) || keyOrUrl.trim();
}

export function getFigmaToken(): string {
  return localStorage.getItem("kickstart_figma_token") || "";
}

export function setFigmaToken(token: string) {
  localStorage.setItem("kickstart_figma_token", token.trim());
}

/**
 * Executes a tool via the FigJam Model Context Protocol (MCP) server
 */
export async function callFigjamMcpTool(
  toolName: string,
  args: Record<string, any> = {}
): Promise<any> {
  const reqId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startTime = performance.now();

  const token = getFigmaToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["x-figma-token"] = token;
  }

  const mcpPayload = {
    jsonrpc: "2.0",
    id: reqId,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: {
        ...args,
        token: args.token || token,
      },
    },
  };

  try {
    const response = await apiFetch("/api/mcp/figjam", {
      method: "POST",
      headers,
      body: JSON.stringify(mcpPayload),
    });

    const durationMs = Math.round(performance.now() - startTime);
    const data = await response.json();

    if (!response.ok || data.error) {
      // JSON-RPC errors are objects; the auth middleware sends a plain string
      const errMsg =
        data.error?.message ||
        (typeof data.error === "string" ? data.error : "") ||
        `HTTP ${response.status} from FigJam MCP Server`;
      recordMcpLog({
        id: reqId,
        timestamp: new Date().toISOString(),
        toolName,
        params: args,
        durationMs,
        status: "error",
        error: errMsg,
      });
      throw new Error(errMsg);
    }

    recordMcpLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      toolName,
      params: args,
      result: data.result,
      durationMs,
      status: "success",
    });

    return data.result;
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    recordMcpLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      toolName,
      params: args,
      durationMs,
      status: "error",
      error: err?.message || "Failed to reach FigJam MCP server",
    });
    throw err;
  }
}

export interface FigjamWriteResult {
  fileKey: string | null;
  fileUrl: string | null;
  embedUrl: string | null;
  summaryText: string;
  canvasPayload?: any;
  syncStatus?: string;
}

/**
 * Writes visual artefact to a FigJam board using the MCP server
 */
export async function writeFigjamArtefactViaMcp(params: {
  title: string;
  type: ArtefactType;
  data: any;
  fileKey?: string;
}): Promise<FigjamWriteResult> {
  const { title, type, data, fileKey: explicitKey } = params;

  // Prefer explicit board key, or fallback to saved default FigJam board
  const targetKey =
    extractFigmaFileKey(explicitKey) ||
    extractFigmaFileKey(getDefaultFigjamBoard()) ||
    null;

  const result = await callFigjamMcpTool("write_figjam_artefact", {
    fileKey: targetKey || undefined,
    artefactType: type,
    title,
    artefactData: data,
  });

  const fileKey = result?.fileKey || null;
  const fileUrl = result?.fileUrl || (fileKey ? `https://www.figma.com/board/${fileKey}` : null);
  const embedUrl =
    result?.embedUrl ||
    (fileUrl ? `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(fileUrl)}` : null);

  return {
    fileKey,
    fileUrl,
    embedUrl,
    summaryText: result?.content?.[0]?.text || `Drew ${title} in FigJam.`,
    canvasPayload: result?.canvasPayload,
    syncStatus: result?.syncStatus,
  };
}

/**
 * Reads an existing FigJam board via the MCP server
 */
export async function readFigjamBoardViaMcp(
  rawKey: string
): Promise<{
  fileKey: string;
  fileName: string;
  fileUrl: string;
  embedUrl: string;
  stickies: string[];
  frames: string[];
  summaryText: string;
}> {
  const fileKey = extractFigmaFileKey(rawKey) || rawKey.trim();
  if (!fileKey) {
    throw new Error("Please enter a valid FigJam board URL or file key.");
  }

  const result = await callFigjamMcpTool("read_figjam_file", { fileKey });

  return {
    fileKey: result.fileKey,
    fileName: result.fileName,
    fileUrl: result.fileUrl,
    embedUrl: result.embedUrl,
    stickies: result.stickies || [],
    frames: result.frames || [],
    summaryText: result.content?.[0]?.text || "Successfully read FigJam board.",
  };
}

export interface FigjamArtefactResult {
  fileId: string | null;
  fileUrl: string | null;
  embedUrl: string | null;
  summaryText: string;
  boardData?: any;
  canvasPayload?: any;
  syncStatus?: string;
}

/**
 * Generates FigJam visual artefact specifications and synchronizes via MCP
 */
export async function generateFigjamArtefactViaMcp(params: {
  title: string;
  type: ArtefactType;
  data: any;
  fileKey?: string;
}): Promise<FigjamArtefactResult> {
  const writeRes = await writeFigjamArtefactViaMcp(params);
  return {
    fileId: writeRes.fileKey,
    fileUrl: writeRes.fileUrl,
    embedUrl: writeRes.embedUrl,
    summaryText: writeRes.summaryText,
    boardData: params.data,
    canvasPayload: writeRes.canvasPayload,
    syncStatus: writeRes.syncStatus,
  };
}

/**
 * Checks Desktop Bridge connection status
 */
export async function checkFigjamBridgeStatus(fileKey?: string): Promise<{
  connected: boolean;
  connectedClients: number;
  figjamReady: boolean;
  figjamFileName: string | null;
  figjamFileKey: string | null;
  port: number | null;
  error?: string;
}> {
  try {
    const res = await callFigjamMcpTool("figjam_get_bridge_status", fileKey ? { fileKey } : {});
    return {
      connected: !!res?.connected,
      connectedClients: res?.connectedClients || 0,
      figjamReady: !!res?.figjamReady,
      figjamFileName: res?.figjamFileName || null,
      figjamFileKey: res?.figjamFileKey || null,
      port: res?.port || 9223,
    };
  } catch (err) {
    console.warn("[FigJam MCP] Bridge status check failed:", err);
    return {
      connected: false,
      connectedClients: 0,
      figjamReady: false,
      figjamFileName: null,
      figjamFileKey: null,
      port: 9223,
      error: (err as Error)?.message,
    };
  }
}

/**
 * Pings FigJam MCP server and checks latency
 */
export async function pingFigjamMcpServer(): Promise<{
  online: boolean;
  latencyMs: number;
  serverInfo?: string;
}> {
  const start = performance.now();
  try {
    const res = await apiFetch("/api/mcp/figjam/status");
    const data = await res.json();
    const latencyMs = Math.round(performance.now() - start);
    return {
      online: data.status === "connected",
      latencyMs,
      serverInfo: data.server,
    };
  } catch {
    return { online: false, latencyMs: 0 };
  }
}
