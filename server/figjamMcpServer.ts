/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import http from "http";
import { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { buildWireframeScreen, str, WF, WireElement, WireRegion } from "./wireframeLayout.ts";

export type { WireElement } from "./wireframeLayout.ts";

/**
 * Extracts a Figma / FigJam file key from any URL or string
 */
export function extractFigmaFileKey(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Try standard URL parsing first
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const keyIndex = parts.findIndex((p) =>
      ["board", "file", "design"].includes(p.toLowerCase())
    );
    if (keyIndex !== -1 && parts[keyIndex + 1]) {
      const candidate = parts[keyIndex + 1];
      if (/^[a-zA-Z0-9_-]{8,64}$/.test(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Ignore URL parse error and fallback to regex
  }

  // Regex match for figma.com/(board|file|design)/:key
  const match = trimmed.match(
    /(?:figma\.com|embed\.figma\.com)\/(?:board|file|design|community\/file)\/([a-zA-Z0-9_-]{8,64})/i
  );
  if (match && match[1]) return match[1];

  // Raw file key candidate (alphanumeric, 10-60 chars)
  if (/^[a-zA-Z0-9_-]{10,60}$/.test(trimmed)) return trimmed;
  return null;
}

/* ==========================================================================
   Desktop Bridge WebSocket Manager (Ports 9223 - 9232)

   The Figma Desktop Bridge plugin (shipped with figma-console-mcp) scans
   ports 9223-9232, probes GET /health on each, and opens a WebSocket to every
   server that answers. Requests are { id, method, params } and replies are
   { id, result } or { id, error }. EXECUTE_CODE runs Plugin API code inside the
   open file, which is the only way to create real FigJam nodes: the Figma REST
   API (personal access tokens) can read files and post comments, nothing more.
   ========================================================================== */
const BRIDGE_PORT_START = 9223;
const BRIDGE_PORT_END = 9232;
const BRIDGE_SERVER_VERSION = "1.2.0";

export interface BridgeFileInfo {
  fileName?: string;
  fileKey?: string | null;
  currentPage?: string;
  editorType?: string;
}

interface BridgeClient {
  ws: WebSocket;
  id: string;
  connectedAt: Date;
  /** Last connect or FILE_INFO message; the newest one is the file the user is working in */
  lastActiveAt: number;
  fileInfo: BridgeFileInfo | null;
}

interface PendingBridgeRequest {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const bridgeClients = new Map<string, BridgeClient>();
const pendingBridgeRequests = new Map<string, PendingBridgeRequest>();
let desktopBridgeWss: WebSocketServer | null = null;
let bridgePortActive: number | null = null;

export function initDesktopBridgeServer(port = BRIDGE_PORT_START) {
  if (desktopBridgeWss) return;
  if (port > BRIDGE_PORT_END) {
    console.warn(
      `[FigJam MCP] No free Desktop Bridge port in ${BRIDGE_PORT_START}-${BRIDGE_PORT_END}. FigJam drawing is disabled.`
    );
    return;
  }

  // The plugin only dials ports whose /health reply matches this shape
  const httpServer = http.createServer((req, res) => {
    if (req.url?.startsWith("/health")) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          status: "ok",
          version: BRIDGE_SERVER_VERSION,
          clients: bridgeClients.size,
          server: "kickstart",
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  httpServer.once("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      // Port taken (often by figma-console-mcp itself); the plugin connects to every port, so move on
      initDesktopBridgeServer(port + 1);
    } else {
      console.warn(`[FigJam MCP] Desktop Bridge failed on port ${port}:`, err?.message);
    }
  });

  httpServer.listen(port, "localhost", () => {
    const wss = new WebSocketServer({ server: httpServer });
    desktopBridgeWss = wss;
    bridgePortActive = port;

    wss.on("connection", (ws) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      bridgeClients.set(clientId, { ws, id: clientId, connectedAt: new Date(), lastActiveAt: Date.now(), fileInfo: null });
      console.log(`[FigJam MCP] Figma Desktop Bridge connected on port ${port} (${clientId})`);

      ws.send(
        JSON.stringify({
          type: "SERVER_HELLO",
          data: { port, pid: process.pid, serverVersion: BRIDGE_SERVER_VERSION },
        })
      );

      ws.on("message", (raw) => {
        let message: any;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (message?.type === "FILE_INFO" && message.data) {
          const client = bridgeClients.get(clientId);
          if (client) {
            client.fileInfo = message.data;
            client.lastActiveAt = Date.now();
          }
          console.log(
            `[FigJam MCP] Bridge ${clientId} is in "${message.data.fileName}" (${message.data.editorType})`
          );
          return;
        }

        if (message?.id && pendingBridgeRequests.has(message.id)) {
          const pending = pendingBridgeRequests.get(message.id)!;
          pendingBridgeRequests.delete(message.id);
          clearTimeout(pending.timer);
          if (message.error) {
            pending.reject(new Error(String(message.error)));
          } else {
            pending.resolve(message.result);
          }
        }
      });

      ws.on("close", () => {
        bridgeClients.delete(clientId);
        console.log(`[FigJam MCP] Figma Desktop Bridge disconnected (${clientId})`);
      });

      ws.on("error", (err) => {
        console.warn(`[FigJam MCP] Bridge client error (${clientId}):`, err.message);
      });
    });

    console.log(`[FigJam MCP] Desktop Bridge listening on ws://localhost:${port}`);
  });
}

initDesktopBridgeServer();

/** Editors the drawing code supports: FigJam boards and Figma Design files */
export const DRAWABLE_EDITOR_TYPES = ["figjam", "figma"];

/**
 * Builds a file link. FigJam opens at /board/, Figma Design at /design/, and /file/ redirects to either.
 */
export function figmaFileUrl(fileKey: string, editorType?: string | null): string {
  const path = editorType === "figjam" ? "board" : editorType === "figma" ? "design" : "file";
  return `https://www.figma.com/${path}/${fileKey}`;
}

/**
 * Picks the connected bridge client running inside a FigJam or Figma Design file.
 * Prefers the file matching `fileKey` when one is given, then the most recently opened file.
 */
export function findFigjamBridgeClient(fileKey?: string | null): BridgeClient | null {
  const open = [...bridgeClients.values()].filter((c) => c.ws.readyState === WebSocket.OPEN);
  const drawable = open
    .filter((c) => DRAWABLE_EDITOR_TYPES.includes(c.fileInfo?.editorType || ""))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  if (fileKey) {
    const match = drawable.find((c) => c.fileInfo?.fileKey === fileKey);
    if (match) return match;
  }
  return drawable[0] || null;
}

export function listBridgeClients() {
  return [...bridgeClients.values()].map((c) => ({
    id: c.id,
    connectedAt: c.connectedAt.toISOString(),
    fileName: c.fileInfo?.fileName || null,
    fileKey: c.fileInfo?.fileKey || null,
    editorType: c.fileInfo?.editorType || null,
  }));
}

function sendBridgeRequest(
  client: BridgeClient,
  method: string,
  params: any,
  timeoutMs: number
): Promise<any> {
  const id = `kick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingBridgeRequests.delete(id);
      reject(new Error(`Figma Desktop Bridge did not answer within ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    pendingBridgeRequests.set(id, { resolve, reject, timer });
    client.ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * Asks each open bridge client which file it is in, because the FILE_INFO message sent on connect can be missed.
 */
export async function refreshBridgeFileInfo(timeoutMs = 3000): Promise<void> {
  const open = [...bridgeClients.values()].filter((c) => c.ws.readyState === WebSocket.OPEN);
  await Promise.all(
    open.map(async (client) => {
      try {
        const reply = await sendBridgeRequest(client, "GET_FILE_INFO", {}, timeoutMs);
        const info = reply?.fileInfo || reply;
        if (info?.editorType) {
          client.fileInfo = info;
        }
      } catch {
        // Keep the last known file info
      }
    })
  );
}

/**
 * Runs Plugin API code inside the bridge client's open file and returns the code's return value.
 */
export async function executeInFigjam(client: BridgeClient, code: string, timeoutMs = 30000): Promise<any> {
  const reply = await sendBridgeRequest(client, "EXECUTE_CODE", { code, timeout: timeoutMs }, timeoutMs + 5000);
  // The plugin wraps results as { success, result, error }
  if (reply && typeof reply === "object" && "success" in reply) {
    if (!reply.success) {
      throw new Error(reply.error || "FigJam plugin code failed.");
    }
    return reply.result;
  }
  return reply;
}

/* ==========================================================================
   Canvas Elements Compiler for FigJam
   ========================================================================== */
export interface FigjamSticky {
  id: string;
  text: string;
  color: "YELLOW" | "BLUE" | "GREEN" | "PINK" | "PURPLE" | "ORANGE" | "GRAY" | "TEAL" | "WHITE";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Stickies with the same column are stacked top to bottom using their real drawn heights */
  column?: string;
}

/** A device frame (phone, tablet, browser) holding wireframe primitives */
export interface FigjamScreen {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  strokeWeight: number;
  elements: WireElement[];
}

/** Free text placed on the board (titles, column headings) */
export interface FigjamLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  weight: "Regular" | "Medium" | "Semi Bold" | "Bold";
  color: string;
}

export interface FigjamShape {
  id: string;
  shapeType: "ROUNDED_RECTANGLE" | "DIAMOND" | "RECTANGLE" | "ELLIPSE";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
}

export interface FigjamConnector {
  id: string;
  fromId: string;
  toId: string;
  text?: string;
  startPosition?: "RIGHT" | "BOTTOM";
  endPosition?: "LEFT" | "TOP";
  /** Back edge (e.g. a retry); drawn under the row so it does not cover the forward arrow */
  loop?: boolean;
}

export interface FigjamSection {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nodes wrapped in their own section inside the artefact section, e.g. an affinity map theme */
export interface FigjamGroup {
  id: string;
  title: string;
  memberIds: string[];
}

export interface FigjamCanvasPayload {
  title: string;
  artefactType: string;
  stickies: FigjamSticky[];
  shapes: FigjamShape[];
  connectors: FigjamConnector[];
  sections: FigjamSection[];
  screens: FigjamScreen[];
  labels: FigjamLabel[];
  groups: FigjamGroup[];
  tsvData: string;
  svgData: string;
}

/* Words that say little about where a design note points */
const STOPWORDS = new Set(
  (
    "the and for with that this from into your their they them are use using ensure make should " +
    "least most more clean screen mobile desktop tablet user users visual layout design maximize " +
    "real estate prioritize hierarchy functionality provide keep allow clear easy quick each every " +
    "item items section sections content page view also than then when where which while based"
  ).split(" ")
);

const keywords = (text: string): string[] =>
  str(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .map((w) => w.replace(/s$/, ""));

/**
 * Links each design note to the screen region whose words it shares, so the note
 * can carry a numbered marker that also appears on the screen.
 */
function matchNoteToRegion(note: string, regions: WireRegion[]): WireRegion | null {
  const words = new Set(keywords(note));
  let best: WireRegion | null = null;
  let bestScore = 0;
  regions.forEach((r) => {
    // Words in the region's own title count most, so "Reorder" picks the "Buy again / Reorder" section
    const labelHits = new Set(keywords(r.label).filter((w) => words.has(w))).size;
    const score = new Set(keywords(r.text).filter((w) => words.has(w))).size + labelHits * 3;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  });
  return best;
}

/**
 * Compiles visual artefact data into rich, native FigJam canvas specifications
 */
export function generateFigjamCanvasElements(
  artefactType: string,
  title: string,
  data: any = {}
): FigjamCanvasPayload {
  const stickies: FigjamSticky[] = [];
  const shapes: FigjamShape[] = [];
  const connectors: FigjamConnector[] = [];
  const sections: FigjamSection[] = [];
  const screens: FigjamScreen[] = [];
  const labels: FigjamLabel[] = [];
  const groups: FigjamGroup[] = [];
  const tsvLines: string[] = [];

  const startX = 120;
  const startY = 160;

  if (artefactType === "user-flow") {
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const connections = Array.isArray(data.connections) ? data.connections : [];

    // Title Section
    sections.push({
      id: "sec_flow_1",
      title: `User Flow: ${title || "Core Task"}`,
      x: startX - 40,
      y: startY - 80,
      width: Math.max(900, (nodes.length + 2) * 320),
      height: 600,
    });

    tsvLines.push(`[User Flow] ${title}`);
    if (data.userGoal) tsvLines.push(`Goal: ${data.userGoal}`);
    tsvLines.push("");

    // Every shape in the row is centred on this line; sizes leave room for the full text
    const rowMid = startY + 170;
    const STEP_GAP = 400;

    // Start Capsule
    const startId = "shape_start";
    shapes.push({
      id: startId,
      shapeType: "ROUNDED_RECTANGLE",
      text: `🏁 START\n${data.startTrigger || "User Initiates Flow"}`,
      x: startX,
      y: rowMid - 60,
      width: 240,
      height: 120,
      fillColor: "#DCFCE7",
      strokeColor: "#16A34A",
    });
    tsvLines.push(`START: ${data.startTrigger || "User Initiates Flow"}`);

    let prevShapeId = startId;
    let currentX = startX + 340;

    // Node items
    nodes.forEach((n: any, idx: number) => {
      const shapeId = `shape_node_${n.id || idx}`;
      const isDecision = n.type === "decision";
      const isEnd = n.type === "end";

      const shapeType = isDecision ? "DIAMOND" : "ROUNDED_RECTANGLE";
      const fillColor = isDecision ? "#FEF9C3" : isEnd ? "#F3E8FF" : "#EFF6FF";
      const strokeColor = isDecision ? "#CA8A04" : isEnd ? "#9333EA" : "#2563EB";

      const label = n.label || `Step ${idx + 1}`;
      const desc = n.description ? `\n${n.description}` : "";
      // Diamonds have little room for text, so the system response only goes on boxes
      const sys = n.systemResponse && !isDecision ? `\nSystem: ${n.systemResponse}` : "";
      const width = 300;
      const height = isDecision ? 300 : 220;

      shapes.push({
        id: shapeId,
        shapeType,
        text: `${isDecision ? "🤔 DECISION" : isEnd ? "🏁 END" : `STEP ${idx + 1}`}\n${label}${desc}${sys}`,
        x: currentX,
        y: rowMid - height / 2,
        width,
        height,
        fillColor,
        strokeColor,
      });

      tsvLines.push(`[${isDecision ? "Decision" : isEnd ? "End" : `Step ${idx + 1}`}] ${label} - ${n.description || ""}`);

      // Edge case note as sticky note next to node
      if (n.edgeCaseNote) {
        stickies.push({
          id: `sticky_edge_${idx}`,
          text: `⚠️ Edge Case:\n${n.edgeCaseNote}`,
          color: "ORANGE",
          x: currentX + 30,
          y: rowMid + 270,
          width: 200,
          height: 160,
        });
      }

      // Connect sequentially if explicit connections aren't provided; always link START to the first node
      if (connections.length === 0 || idx === 0) {
        connectors.push({
          id: `conn_${prevShapeId}_${shapeId}`,
          fromId: prevShapeId,
          toId: shapeId,
          text: isDecision ? "Evaluates" : "Next",
        });
      }

      prevShapeId = shapeId;
      currentX += STEP_GAP;
    });

    // Explicit connections if provided
    const nodeIndex = new Map(nodes.map((n: any, idx: number) => [n.id, idx]));
    connections.forEach((conn: any, idx: number) => {
      const fromIdx = nodeIndex.get(conn.from);
      const toIdx = nodeIndex.get(conn.to);
      connectors.push({
        id: `conn_exp_${idx}`,
        fromId: `shape_node_${conn.from}`,
        toId: `shape_node_${conn.to}`,
        text: conn.conditionLabel || undefined,
        loop: fromIdx !== undefined && toIdx !== undefined && (toIdx as number) <= (fromIdx as number),
      });
    });

    // END capsule, fed by every node that has no outgoing link and is not already an end node
    const endId = "shape_end";
    const outgoing = new Set(connectors.map((c) => c.fromId));
    const deadEnds = nodes
      .map((n: any, idx: number) => ({ n, shapeId: `shape_node_${n.id || idx}` }))
      .filter(({ n, shapeId }: any) => n.type !== "end" && !outgoing.has(shapeId))
      .map(({ shapeId }: any) => shapeId);
    if (nodes.length === 0) deadEnds.push(startId);

    if (deadEnds.length > 0) {
      shapes.push({
        id: endId,
        shapeType: "ROUNDED_RECTANGLE",
        text: `🏁 END\n${data.endOutcome || "Flow Complete"}`,
        x: currentX,
        y: rowMid - 60,
        width: 240,
        height: 120,
        fillColor: "#F3E8FF",
        strokeColor: "#9333EA",
      });
      tsvLines.push(`END: ${data.endOutcome || "Flow Complete"}`);
      deadEnds.forEach((fromId: string) => {
        connectors.push({ id: `conn_${fromId}_end`, fromId, toId: endId });
      });
    }

    // Key Considerations Stickies
    if (Array.isArray(data.keyDesignConsiderations) && data.keyDesignConsiderations.length > 0) {
      data.keyDesignConsiderations.forEach((item: string, idx: number) => {
        stickies.push({
          id: `sticky_consideration_${idx}`,
          text: `💡 UX Principle:\n${item}`,
          color: "YELLOW",
          x: startX + idx * 280,
          y: rowMid + 600,
          width: 240,
          height: 180,
        });
      });
    }
  } else if (artefactType === "user-journey-map") {
    const phases = Array.isArray(data.phases) ? data.phases : [];

    sections.push({
      id: "sec_journey_1",
      title: `Customer Journey Map: ${title || "Experience"} (Persona: ${data.personaName || "Primary User"})`,
      x: startX - 40,
      y: startY - 80,
      width: Math.max(1000, phases.length * 360),
      height: 900,
    });

    tsvLines.push(`[Customer Journey Map] ${title}`);
    if (data.personaName) tsvLines.push(`Persona: ${data.personaName}`);
    if (data.scenario) tsvLines.push(`Scenario: ${data.scenario}`);
    tsvLines.push("");

    let colX = startX;

    phases.forEach((phase: any, pIdx: number) => {
      // Phase Column Header Shape
      shapes.push({
        id: `shape_phase_${pIdx}`,
        shapeType: "ROUNDED_RECTANGLE",
        text: `PHASE ${pIdx + 1}: ${phase.phaseName || "Stage"}\n\nSentiment: ${phase.sentiment || "Neutral"} (${phase.sentimentScore || 3}/5)`,
        x: colX,
        y: startY,
        width: 320,
        height: 90,
        fillColor: "#F1F5F9",
        strokeColor: "#475569",
      });

      tsvLines.push(`=== PHASE ${pIdx + 1}: ${phase.phaseName} ===`);

      // Actions Sticky
      const actionsList = Array.isArray(phase.userActions) ? phase.userActions.join("\n• ") : "";
      if (actionsList) {
        stickies.push({
          id: `sticky_action_${pIdx}`,
          text: `🎯 User Actions:\n• ${actionsList}`,
          color: "BLUE",
          x: colX,
          y: startY + 110,
          width: 320,
          height: 180,
        });
        tsvLines.push(`Actions: ${actionsList}`);
      }

      // Thoughts Sticky
      if (phase.userThoughts) {
        stickies.push({
          id: `sticky_thoughts_${pIdx}`,
          text: `💭 User Mindset:\n"${phase.userThoughts}"`,
          color: "YELLOW",
          x: colX,
          y: startY + 310,
          width: 320,
          height: 160,
        });
        tsvLines.push(`Thoughts: ${phase.userThoughts}`);
      }

      // Pain Points Sticky
      const painList = Array.isArray(phase.painPoints) ? phase.painPoints.join("\n• ") : "";
      if (painList) {
        stickies.push({
          id: `sticky_pain_${pIdx}`,
          text: `⚡ Pain Points:\n• ${painList}`,
          color: "PINK",
          x: colX,
          y: startY + 490,
          width: 320,
          height: 170,
        });
        tsvLines.push(`Pain Points: ${painList}`);
      }

      // Opportunities Sticky
      const oppList = Array.isArray(phase.opportunities) ? phase.opportunities.join("\n• ") : "";
      if (oppList) {
        stickies.push({
          id: `sticky_opp_${pIdx}`,
          text: `🌱 Design Opportunities:\n• ${oppList}`,
          color: "GREEN",
          x: colX,
          y: startY + 680,
          width: 320,
          height: 170,
        });
        tsvLines.push(`Opportunities: ${oppList}`);
      }

      colX += 350;
    });
  } else if (artefactType === "affinity-map") {
    // Note kinds keep one colour each, so a theme's mix of pain points and insights shows at a glance
    const KIND_STYLE: Record<string, { label: string; color: FigjamSticky["color"]; fill: string }> = {
      insight: { label: "Insight", color: "GREEN", fill: "#B3EFBD" },
      "pain-point": { label: "Pain point", color: "PINK", fill: "#FFC6E6" },
      finding: { label: "Finding", color: "BLUE", fill: "#C2E5FF" },
      quote: { label: "Quote", color: "YELLOW", fill: "#FFE299" },
    };
    const STICKY = 240;
    const COL_GAP = 40;
    const THEME_GAP = 200;
    const asNotes = (list: any): any[] => (Array.isArray(list) ? list.filter((n: any) => n && n.text) : []);
    const noteText = (n: any) => `${str(n.text)}${n.source ? `\n— ${str(n.source)}` : ""}`;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const noteColor = (n: any) => (KIND_STYLE[n.kind] || KIND_STYLE.finding).color;
    // Count distinct sources so each theme shows how widely it is supported
    const sourcesOf = (notes: any[]) =>
      new Set(notes.flatMap((n) => str(n.source).split(/[,;&]/).map((x) => x.trim()).filter(Boolean)));

    const themes = (Array.isArray(data.themes) ? data.themes : []).map((t: any) => ({
      ...t,
      clusters: (Array.isArray(t.clusters) ? t.clusters : []).filter((c: any) => asNotes(c.notes).length > 0),
    })).filter((t: any) => t.clusters.length > 0);
    const outliers = asNotes(data.outliers);
    const takeaways: string[] = Array.isArray(data.keyTakeaways) ? data.keyTakeaways.map(str).filter(Boolean) : [];
    const sources: string[] = Array.isArray(data.sources) ? data.sources.map(str).filter(Boolean) : [];

    sections.push({
      id: "sec_affinity_1",
      title: `Affinity Map: ${title || "Research Synthesis"}`,
      x: startX - 40,
      y: startY - 80,
      width: 1200,
      height: 900,
    });

    tsvLines.push(`[Affinity Map] ${title}`);
    if (data.researchQuestion) tsvLines.push(`Research question: ${data.researchQuestion}`);
    if (sources.length) tsvLines.push(`Sources: ${sources.join(", ")}`);
    tsvLines.push("");

    // Header: research question, sources and a colour key
    let y = startY;
    labels.push({
      id: "label_affinity_question",
      text: data.researchQuestion ? `Research question: ${str(data.researchQuestion)}` : title || "Affinity Map",
      x: startX,
      y,
      width: 1400,
      size: 28,
      weight: "Bold",
      color: WF.ink,
    });
    y += 80;
    if (sources.length) {
      labels.push({
        id: "label_affinity_sources",
        text: `Sources (${sources.length}): ${sources.join(", ")}`,
        x: startX,
        y,
        width: 1400,
        size: 15,
        weight: "Regular",
        color: WF.muted,
      });
      y += 50;
    }
    Object.entries(KIND_STYLE).forEach(([kind, style], idx) => {
      shapes.push({
        id: `shape_key_${kind}`,
        shapeType: "ROUNDED_RECTANGLE",
        text: style.label,
        x: startX + idx * 200,
        y,
        width: 180,
        height: 48,
        fillColor: style.fill,
        strokeColor: style.fill,
      });
    });
    y += 110;

    // Takeaways come first: readers want the conclusions before the evidence
    if (takeaways.length) {
      labels.push({ id: "label_takeaways", text: "Key takeaways", x: startX, y, width: 600, size: 20, weight: "Semi Bold", color: WF.ink });
      takeaways.forEach((t, idx) => {
        stickies.push({
          id: `sticky_takeaway_${idx}`,
          text: `⭐ ${t}`,
          color: "ORANGE",
          x: startX + idx * (STICKY + COL_GAP),
          y: y + 50,
          width: STICKY,
          height: STICKY,
        });
        tsvLines.push(`Takeaway: ${t}`);
      });
      tsvLines.push("");
      y += 50 + STICKY + 160;
    }

    // Each theme is its own section: insight statement on top, one sticky column per cluster
    const drawGroup = (
      gid: string,
      name: string,
      insight: string,
      clusters: Array<{ label: string; notes: any[] }>,
      x: number
    ): number => {
      const memberIds: string[] = [];
      const width = Math.max(clusters.length * STICKY + (clusters.length - 1) * COL_GAP, 520);
      labels.push({ id: `label_${gid}_insight`, text: insight, x, y, width, size: 18, weight: "Semi Bold", color: WF.ink });
      memberIds.push(`label_${gid}_insight`);
      const allNotes: any[] = [];
      clusters.forEach((c, cIdx) => {
        const cx = x + cIdx * (STICKY + COL_GAP);
        if (c.label) {
          labels.push({ id: `label_${gid}_c${cIdx}`, text: c.label, x: cx, y: y + 100, width: STICKY, size: 15, weight: "Semi Bold", color: WF.muted });
          memberIds.push(`label_${gid}_c${cIdx}`);
        }
        c.notes.forEach((n, nIdx) => {
          const id = `sticky_${gid}_c${cIdx}_n${nIdx}`;
          stickies.push({ id, text: noteText(n), color: noteColor(n), x: cx, y: y + 160, width: STICKY, height: STICKY, column: `${gid}_c${cIdx}` });
          memberIds.push(id);
          allNotes.push(n);
        });
      });
      const sourceCount = sourcesOf(allNotes).size;
      groups.push({
        id: gid,
        title: `${name} · ${plural(allNotes.length, "note")}${sourceCount ? `, ${plural(sourceCount, "source")}` : ""}`,
        memberIds,
      });
      return width;
    };

    let themeX = startX + 60;
    themes.forEach((t: any, tIdx: number) => {
      const clusters = t.clusters.map((c: any) => ({ label: str(c.label), notes: asNotes(c.notes) }));
      const width = drawGroup(`theme${tIdx}`, str(t.name) || `Theme ${tIdx + 1}`, str(t.insight), clusters, themeX);
      themeX += width + THEME_GAP;

      tsvLines.push(`=== THEME ${tIdx + 1}: ${t.name} ===`);
      if (t.insight) tsvLines.push(`Insight: ${t.insight}`);
      clusters.forEach((c: any) => {
        tsvLines.push(`  ${c.label}`);
        c.notes.forEach((n: any) => tsvLines.push(`    [${n.kind}] ${n.text}${n.source ? ` (${n.source})` : ""}`));
      });
    });

    // Outliers stay visible in a parking lot instead of being forced into a theme
    if (outliers.length) {
      drawGroup("outliers", "Parking lot", "Notes that fit no theme yet", [{ label: "", notes: outliers }], themeX);
      tsvLines.push("=== PARKING LOT ===");
      outliers.forEach((n: any) => tsvLines.push(`  [${n.kind}] ${n.text}${n.source ? ` (${n.source})` : ""}`));
    }
  } else {
    // Wireframe: a real device frame with greyscale UI blocks, plus annotation columns
    const layout = data.layoutStructure || {};
    const screen = buildWireframeScreen(data);
    const screenX = startX;
    const screenY = startY + 120;

    sections.push({
      id: "sec_wireframe_1",
      title: `Wireframe: ${title || "Screen Specification"} (${data.screenType || "mobile"})`,
      x: startX - 40,
      y: startY - 80,
      width: screen.width + 1000,
      height: screen.height + 200,
    });

    tsvLines.push(`[Wireframe] ${title} (${data.screenType || "Screen"})`);
    if (data.screenPurpose) tsvLines.push(`Purpose: ${data.screenPurpose}`);
    tsvLines.push("");
    if (layout.header?.title) {
      tsvLines.push(`Header: ${layout.header.title} | ${(layout.header.actions || []).join(", ")}`);
    }
    if (layout.heroOrSummary?.title) tsvLines.push(`Hero: ${layout.heroOrSummary.title}`);
    (Array.isArray(layout.mainSections) ? layout.mainSections : []).forEach((sec: any) => {
      tsvLines.push(`Section: ${sec.sectionTitle} (${sec.contentType})`);
      (sec.items || []).forEach((it: any) => tsvLines.push(`  - ${it.title}${it.subtitle ? `: ${it.subtitle}` : ""}`));
    });
    if (layout.footerOrBottomBar?.actions?.length) {
      tsvLines.push(`Bottom bar: ${layout.footerOrBottomBar.actions.join(", ")}`);
    }

    labels.push({
      id: "label_screen_title",
      text: data.screenTitle || title || "Key Screen",
      x: screenX,
      y: startY - 10,
      width: Math.max(screen.width, 600),
      size: 32,
      weight: "Bold",
      color: WF.ink,
    });
    labels.push({
      id: "label_screen_meta",
      text: `${screen.deviceLabel}${data.screenPurpose ? ` — ${data.screenPurpose}` : ""}`,
      x: screenX,
      y: startY + 36,
      width: Math.max(screen.width, 600),
      size: 15,
      weight: "Regular",
      color: WF.muted,
    });

    // Numbered markers on the screen tie each design note to the region it talks about
    const notes: string[] = Array.isArray(data.designNotes) ? data.designNotes.map(str) : [];
    const markersPerRow = new Map<number, number>();
    notes.forEach((note, idx) => {
      const region = matchNoteToRegion(note, screen.regions);
      if (!region) return;
      const stack = markersPerRow.get(region.y) || 0;
      markersPerRow.set(region.y, stack + 1);
      const mx = screen.width - 14 + stack * 30;
      const my = region.y + 4;
      screen.elements.push({ kind: "ellipse", x: mx, y: my, w: 28, h: 28, fill: WF.marker, name: `Annotation ${idx + 1}` });
      screen.elements.push({ kind: "text", x: mx, y: my + 6, w: 28, h: 16, text: String(idx + 1), size: 13, weight: "Bold", color: WF.white, align: "CENTER", maxLines: 1, name: `Annotation ${idx + 1} number` });
    });

    screens.push({
      id: "screen_main",
      name: `${data.screenTitle || title} (${screen.deviceLabel})`,
      x: screenX,
      y: screenY,
      width: screen.width,
      height: screen.height,
      radius: screen.radius,
      strokeWeight: screen.strokeWeight,
      elements: screen.elements,
    });

    const notesX = screenX + screen.width + 120;
    const statesX = notesX + 300;

    if (notes.length > 0) {
      labels.push({ id: "label_notes", text: "Design notes", x: notesX, y: screenY - 40, width: 260, size: 18, weight: "Semi Bold", color: WF.ink });
      notes.forEach((note, idx) => {
        stickies.push({
          id: `sticky_note_${idx}`,
          text: `📌 ${idx + 1}. ${note}`,
          color: "YELLOW",
          x: notesX,
          y: screenY,
          width: 240,
          height: 240,
          column: "notes",
        });
        tsvLines.push(`Note ${idx + 1}: ${note}`);
      });
    }

    const states = Array.isArray(data.interactiveStates) ? data.interactiveStates : [];
    const components = Array.isArray(data.uiComponentsUsed) ? data.uiComponentsUsed : [];
    if (states.length > 0 || components.length > 0) {
      labels.push({ id: "label_states", text: "States & components", x: statesX, y: screenY - 40, width: 300, size: 18, weight: "Semi Bold", color: WF.ink });
    }
    states.forEach((st: any, idx: number) => {
      const diffs = Array.isArray(st.keyDifferences) ? st.keyDifferences.map((d: string) => `\n• ${d}`).join("") : "";
      stickies.push({
        id: `sticky_state_${idx}`,
        text: `🔁 ${st.stateName || `State ${idx + 1}`}\n${st.description || ""}${diffs}`,
        color: "BLUE",
        x: statesX,
        y: screenY,
        width: 240,
        height: 240,
        column: "states",
      });
      tsvLines.push(`State: ${st.stateName} - ${st.description}`);
    });
    if (components.length > 0) {
      stickies.push({
        id: "sticky_components",
        text: `🧩 Components\n${components.map((c: string) => `• ${c}`).join("\n")}`,
        color: "GRAY",
        x: statesX,
        y: screenY,
        width: 240,
        height: 240,
        column: "states",
      });
    }
  }

  // Construct SVG representation for direct vector copy-paste into FigJam
  const svgWidth = Math.max(1000, shapes.length * 280 + 300);
  const svgHeight = 700;
  const svgShapes = shapes
    .map(
      (s) =>
        `<g transform="translate(${s.x},${s.y})">
          <rect width="${s.width}" height="${s.height}" rx="12" fill="${s.fillColor}" stroke="${s.strokeColor}" stroke-width="2"/>
          <text x="16" y="32" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#0F172A">${escapeXml(
            s.text.split("\n")[0]
          )}</text>
          <text x="16" y="56" font-family="system-ui, sans-serif" font-size="11" fill="#475569">${escapeXml(
            s.text.split("\n").slice(1).join(" ")
          )}</text>
        </g>`
    )
    .join("\n");

  const svgData = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
    <rect width="100%" height="100%" fill="#FFFFFF"/>
    ${svgShapes}
  </svg>`;

  return {
    title,
    artefactType,
    stickies,
    shapes,
    connectors,
    sections,
    screens,
    labels,
    groups,
    tsvData: tsvLines.join("\n"),
    svgData,
  };
}

/**
 * Compiles a canvas payload into Plugin API code for the Desktop Bridge EXECUTE_CODE method.
 * The bridge wraps the code in an async function, so it is a function body that ends in `return`.
 * The artefact is drawn on a new page named after it (or to the right of existing content if the
 * file refuses a new page), inside one section, with real shapes, stickies and connectors.
 * Figma Design files have no stickies, shapes with text or connectors, so there they are drawn
 * as frames with text and arrow vectors. Those arrows do not follow the shapes when moved.
 */
export function generateFigjamPluginCode(payload: FigjamCanvasPayload): string {
  const spec = {
    title: payload.title || "Visual Artefact",
    sectionTitle: payload.sections[0]?.title || payload.title || "Visual Artefact",
    shapes: payload.shapes,
    stickies: payload.stickies,
    connectors: payload.connectors,
    screens: payload.screens || [],
    labels: payload.labels || [],
    groups: payload.groups || [],
  };

  return `
const isJam = figma.editorType === "figjam";
if (!isJam && figma.editorType !== "figma") {
  throw new Error("The Desktop Bridge plugin is open in a " + figma.editorType + " file. Open it in a FigJam or Figma Design file.");
}
const spec = ${JSON.stringify(spec)};

const hex = (h) => {
  const n = parseInt(String(h || "#FFFFFF").replace("#", ""), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};
const STICKY_COLORS = {
  YELLOW: "#FFE299", BLUE: "#C2E5FF", GREEN: "#B3EFBD", PINK: "#FFC6E6", PURPLE: "#DCCCFF",
  ORANGE: "#FFD3A8", GRAY: "#E6E6E6", TEAL: "#B3F4EF", WHITE: "#FFFFFF",
};
const loadedFonts = new Set();
const DEFAULT_FONT = { family: "Inter", style: "Medium" };
const REGULAR_FONT = { family: "Inter", style: "Regular" };

const ensureFontLoaded = async (font) => {
  if (!font || typeof font !== "object" || !font.family || !font.style) {
    return false;
  }
  const key = font.family + "/" + font.style;
  if (!loadedFonts.has(key)) {
    try {
      await figma.loadFontAsync(font);
      loadedFonts.add(key);
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
};

const setText = async (sub, text) => {
  if (!sub) return;
  await ensureFontLoaded(DEFAULT_FONT);
  await ensureFontLoaded(REGULAR_FONT);

  let font = sub.fontName;
  if (font === figma.mixed || !font || !font.family || !font.style) {
    sub.fontName = DEFAULT_FONT;
  } else {
    const ok = await ensureFontLoaded(font);
    if (!ok) {
      sub.fontName = DEFAULT_FONT;
    }
  }
  sub.characters = text || "";
};

const interFont = async (style) => {
  const font = { family: "Inter", style: style || "Regular" };
  return (await ensureFontLoaded(font)) ? font : REGULAR_FONT;
};

const makeText = async (value, o) => {
  const t = figma.createText();
  t.fontName = await interFont(o.weight);
  t.fontSize = o.size || 14;
  t.characters = value || "";
  t.fills = [{ type: "SOLID", color: hex(o.color || "#1E293B") }];
  t.textAlignHorizontal = o.align || "LEFT";
  t.resize(Math.max(1, o.w), Math.max(1, t.height));
  t.textAutoResize = "HEIGHT";
  if (o.maxLines) {
    try { t.textTruncation = "ENDING"; t.maxLines = o.maxLines; } catch (e) {}
  }
  return t;
};

// Draws one wireframe primitive; the caller appends it to a frame and positions it
const drawWireElement = async (el) => {
  let n;
  if (el.kind === "text") {
    n = await makeText(el.text, el);
  } else if (el.kind === "line") {
    n = figma.createLine();
    const dx = el.x2 - el.x;
    const dy = el.y2 - el.y;
    n.resize(Math.max(0.01, Math.hypot(dx, dy)), 0);
    n.rotation = -Math.atan2(dy, dx) * 180 / Math.PI;
    n.strokes = [{ type: "SOLID", color: hex(el.stroke || "#CBD5E1") }];
    n.strokeWeight = el.strokeWeight || 1;
    if (el.dash) { try { n.dashPattern = [8, 6]; } catch (e) {} }
  } else {
    n = el.kind === "ellipse" ? figma.createEllipse() : figma.createRectangle();
    n.resize(Math.max(1, el.w), Math.max(1, el.h));
    n.fills = el.fill ? [{ type: "SOLID", color: hex(el.fill) }] : [];
    n.strokes = el.stroke ? [{ type: "SOLID", color: hex(el.stroke) }] : [];
    if (el.stroke) n.strokeWeight = el.strokeWeight || 1;
    if (el.dash) { try { n.dashPattern = [6, 4]; } catch (e) {} }
    if (el.radius && el.kind === "rect") n.cornerRadius = el.radius;
  }
  if (el.opacity !== undefined) n.opacity = el.opacity;
  if (el.name) n.name = el.name;
  return n;
};

// Figma Design stand-in for a FigJam shape with text: an outline shape with centred text in a frame
const makeDesignShape = async (s) => {
  const frame = figma.createFrame();
  frame.name = (s.text || "Shape").slice(0, 60);
  frame.resize(s.width, s.height);
  frame.fills = [];
  frame.clipsContent = false;
  let body;
  if (s.shapeType === "ELLIPSE") {
    body = figma.createEllipse();
  } else if (s.shapeType === "DIAMOND") {
    body = figma.createPolygon();
    body.pointCount = 4;
  } else {
    body = figma.createRectangle();
    if (s.shapeType === "ROUNDED_RECTANGLE") body.cornerRadius = 16;
  }
  body.resize(s.width, s.height);
  body.fills = [{ type: "SOLID", color: hex(s.fillColor) }];
  body.strokes = [{ type: "SOLID", color: hex(s.strokeColor) }];
  body.strokeWeight = 2;
  frame.appendChild(body);
  body.x = 0;
  body.y = 0;
  // A diamond's usable middle is half its width
  const inset = s.shapeType === "DIAMOND" ? s.width / 4 : 12;
  const t = await makeText(s.text, { w: s.width - inset * 2, size: 14, weight: "Medium", align: "CENTER" });
  frame.appendChild(t);
  t.x = inset;
  t.y = Math.max(0, (s.height - t.height) / 2);
  return frame;
};

// Figma Design stand-in for a FigJam sticky: a coloured auto layout frame that grows with its text
const makeDesignSticky = async (s) => {
  const width = s.width > 240 ? 416 : 240;
  const frame = figma.createFrame();
  frame.name = "Sticky";
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = 16;
  frame.resize(width, 240);
  frame.minHeight = 240;
  frame.fills = [{ type: "SOLID", color: hex(STICKY_COLORS[s.color] || STICKY_COLORS.YELLOW) }];
  frame.effects = [{
    type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 2 },
    radius: 6, spread: 0, visible: true, blendMode: "NORMAL",
  }];
  const t = await makeText(s.text, { w: width - 32, size: 16, color: "#1E1E1E" });
  frame.appendChild(t);
  t.layoutSizingHorizontal = "FILL";
  return frame;
};

// Figma Design stand-in for a connector: an arrow vector between the two nodes' edges, plus a label
const makeDesignArrow = async (from, to, c) => {
  const box = (n) => ({ x: n.x, y: n.y, w: n.width, h: n.height, cx: n.x + n.width / 2, cy: n.y + n.height / 2 });
  const a = box(from);
  const b = box(to);
  let pts;
  if (c.loop) {
    // Back edges run under the row, like the FigJam BOTTOM magnets
    const drop = Math.max(a.y + a.h, b.y + b.h) + 60;
    pts = [{ x: a.cx, y: a.y + a.h }, { x: a.cx, y: drop }, { x: b.cx, y: drop }, { x: b.cx, y: b.y + b.h }];
  } else {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    if (!dx && !dy) return [];
    // Where the line from the centre leaves the node's bounding box
    const edge = (r, ux, uy) => {
      const t = Math.min(ux ? r.w / 2 / Math.abs(ux) : Infinity, uy ? r.h / 2 / Math.abs(uy) : Infinity);
      return { x: r.cx + ux * t, y: r.cy + uy * t };
    };
    pts = [edge(a, dx, dy), edge(b, -dx, -dy)];
  }
  const left = Math.min(...pts.map((p) => p.x));
  const top = Math.min(...pts.map((p) => p.y));
  const network = {
    vertices: pts.map((p, i) => ({
      x: p.x - left,
      y: p.y - top,
      strokeCap: i === pts.length - 1 ? "ARROW_LINES" : "NONE",
    })),
    segments: pts.slice(1).map((p, i) => ({ start: i, end: i + 1 })),
  };
  const arrow = figma.createVector();
  arrow.name = "Connector";
  if (arrow.setVectorNetworkAsync) await arrow.setVectorNetworkAsync(network);
  else arrow.vectorNetwork = network;
  arrow.x = left;
  arrow.y = top;
  arrow.fills = [];
  arrow.strokes = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.45 } }];
  arrow.strokeWeight = 2;
  const nodes = [arrow];
  if (c.text) {
    // Label sits on a white chip at the middle of the middle segment
    const mid = Math.floor((pts.length - 1) / 2);
    const mx = (pts[mid].x + pts[mid + 1].x) / 2;
    const my = (pts[mid].y + pts[mid + 1].y) / 2;
    const chip = figma.createFrame();
    chip.name = "Connector label";
    chip.layoutMode = "HORIZONTAL";
    chip.primaryAxisSizingMode = "AUTO";
    chip.counterAxisSizingMode = "AUTO";
    chip.paddingLeft = chip.paddingRight = 6;
    chip.paddingTop = chip.paddingBottom = 2;
    chip.cornerRadius = 4;
    chip.fills = [{ type: "SOLID", color: hex("#FFFFFF") }];
    const t = await makeText(c.text, { w: 140, size: 12, color: "#475569", align: "CENTER" });
    t.textAutoResize = "WIDTH_AND_HEIGHT";
    chip.appendChild(t);
    chip.x = mx - chip.width / 2;
    chip.y = my - chip.height / 2;
    nodes.push(chip);
  }
  return nodes;
};

// Each artefact gets its own page; fall back to free space on the current page
const startPage = figma.currentPage;
let page = startPage;
let newPage = false;
try {
  const created = figma.createPage();
  created.name = spec.title;
  try {
    await figma.setCurrentPageAsync(created);
    page = created;
    newPage = true;
    // A new page gets a white canvas, not the editor's default grey
    try { page.backgrounds = [{ type: "SOLID", color: hex("#FFFFFF") }]; } catch (e) {}
  } catch (e) {
    created.remove();
  }
} catch (e) {}
let offsetX = 0;
if (!newPage && page.children.length > 0) {
  offsetX = Math.max(...page.children.map((n) => n.x + n.width)) + 400;
}

const byId = {};
const placed = [];
const made = [];
let section;
let connectorCount = 0;
const grouped = new Set();
const groupSections = [];

try {
for (const sc of spec.screens) {
  const frame = figma.createFrame();
  made.push(frame);
  frame.name = sc.name;
  frame.resize(sc.width, sc.height);
  frame.x = sc.x + offsetX;
  frame.y = sc.y;
  frame.fills = [{ type: "SOLID", color: hex("#FFFFFF") }];
  frame.cornerRadius = sc.radius;
  frame.strokes = [{ type: "SOLID", color: hex("#1E293B") }];
  frame.strokeWeight = sc.strokeWeight;
  frame.strokeAlign = "OUTSIDE";
  // Clip so full-width bars follow the device's rounded corners
  frame.clipsContent = true;
  byId[sc.id] = frame;
  placed.push(frame);
  const markers = [];
  for (const el of sc.elements) {
    const n = await drawWireElement(el);
    made.push(n);
    if (el.name && el.name.startsWith("Annotation")) {
      // Markers sit on the frame edge, outside the clip, so they are drawn next to the frame
      markers.push(n);
      n.x = frame.x + el.x;
      n.y = frame.y + el.y;
    } else {
      frame.appendChild(n);
      n.x = el.x;
      n.y = el.y;
    }
  }
  placed.push(...markers);
}

for (const l of spec.labels) {
  const t = await makeText(l.text, { w: l.width, size: l.size, weight: l.weight, color: l.color });
  made.push(t);
  t.x = l.x + offsetX;
  t.y = l.y;
  byId[l.id] = t;
  placed.push(t);
}

for (const s of spec.shapes) {
  let node;
  if (isJam) {
    node = figma.createShapeWithText();
    made.push(node);
    node.shapeType = s.shapeType === "RECTANGLE" ? "SQUARE" : s.shapeType;
    node.resize(s.width, s.height);
    node.fills = [{ type: "SOLID", color: hex(s.fillColor) }];
    node.strokes = [{ type: "SOLID", color: hex(s.strokeColor) }];
    await setText(node.text, s.text);
  } else {
    node = await makeDesignShape(s);
    made.push(node);
  }
  node.x = s.x + offsetX;
  node.y = s.y;
  byId[s.id] = node;
  placed.push(node);
}

for (const s of spec.stickies) {
  let sticky;
  if (isJam) {
    sticky = figma.createSticky();
    made.push(sticky);
    await setText(sticky.text, s.text);
    try { sticky.fills = [{ type: "SOLID", color: hex(STICKY_COLORS[s.color] || STICKY_COLORS.YELLOW) }]; } catch (e) {}
    if (s.width > 240) { try { sticky.isWideWidth = true; } catch (e) {} }
  } else {
    sticky = await makeDesignSticky(s);
    made.push(sticky);
  }
  sticky.x = s.x + offsetX;
  sticky.y = s.y;
  byId[s.id] = sticky;
  placed.push(sticky);
}

// Stack stickies that share a column using their real heights, so they never overlap
const columnBottom = {};
for (const s of spec.stickies) {
  if (!s.column) continue;
  const sticky = byId[s.id];
  if (columnBottom[s.column] !== undefined) sticky.y = columnBottom[s.column] + 24;
  columnBottom[s.column] = sticky.y + sticky.height;
}

// Wrap each group (e.g. an affinity theme) in its own section, after stacking so it fits the real heights
for (const g of spec.groups) {
  const members = g.memberIds.map((id) => byId[id]).filter(Boolean);
  if (members.length === 0) continue;
  const gx = Math.min(...members.map((n) => n.x));
  const gy = Math.min(...members.map((n) => n.y));
  const gw = Math.max(...members.map((n) => n.x + n.width)) - gx;
  const gh = Math.max(...members.map((n) => n.y + n.height)) - gy;
  const gs = figma.createSection();
  made.push(gs);
  gs.name = g.title;
  try { gs.fills = [{ type: "SOLID", color: hex("#FFFFFF") }]; } catch (e) {}
  gs.x = gx - 48;
  gs.y = gy - 96;
  gs.resizeWithoutConstraints(gw + 96, gh + 144);
  for (const m of members) {
    const absX = m.x;
    const absY = m.y;
    gs.appendChild(m);
    m.x = absX - gs.x;
    m.y = absY - gs.y;
    grouped.add(m);
  }
  groupSections.push(gs);
}
if (groupSections.length) {
  const loose = placed.filter((n) => !grouped.has(n));
  placed.length = 0;
  placed.push(...loose, ...groupSections);
}

for (const c of spec.connectors) {
  const from = byId[c.fromId];
  const to = byId[c.toId];
  if (!from || !to) continue;
  if (!isJam) {
    const nodes = await makeDesignArrow(from, to, c);
    made.push(...nodes);
    placed.push(...nodes);
    if (nodes.length) connectorCount++;
    continue;
  }
  const conn = figma.createConnector();
  made.push(conn);
  conn.connectorStart = { endpointNodeId: from.id, magnet: c.loop ? "BOTTOM" : "AUTO" };
  conn.connectorEnd = { endpointNodeId: to.id, magnet: c.loop ? "BOTTOM" : "AUTO" };
  conn.connectorEndStrokeCap = "ARROW_LINES";
  conn.strokes = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.45 } }];
  if (c.text) await setText(conn.text, c.text);
  connectorCount++;
}

// Wrap everything in one section sized to the content
const minX = Math.min(...placed.map((n) => n.x));
const minY = Math.min(...placed.map((n) => n.y));
const maxX = Math.max(...placed.map((n) => n.x + n.width));
const maxY = Math.max(...placed.map((n) => n.y + n.height));
section = figma.createSection();
made.push(section);
section.name = spec.sectionTitle;
// Every artefact sits on a white board so its text stays legible
try { section.fills = [{ type: "SOLID", color: hex("#FFFFFF") }]; } catch (e) {}
section.x = minX - 80;
section.y = minY - 120;
section.resizeWithoutConstraints(maxX - minX + 160, maxY - minY + 200);
for (const node of placed) {
  const absX = node.x;
  const absY = node.y;
  section.appendChild(node);
  node.x = absX - section.x;
  node.y = absY - section.y;
}
} catch (err) {
  // Leave the file as it was: drop the half-drawn artefact and its page
  for (const node of made) { try { node.remove(); } catch (e) {} }
  if (newPage) {
    try { await figma.setCurrentPageAsync(startPage); page.remove(); } catch (e) {}
  }
  throw err;
}

figma.viewport.scrollAndZoomIntoView([section]);

return {
  fileKey: figma.fileKey || null,
  fileName: figma.root.name,
  editorType: figma.editorType,
  pageId: page.id,
  pageName: page.name,
  newPage,
  sectionId: section.id,
  groups: groupSections.length,
  shapes: spec.shapes.length,
  screens: spec.screens.length,
  stickies: spec.stickies.length,
  connectors: connectorCount,
};
`;
}

function escapeMermaidText(text?: string): string {
  if (!text) return "";
  return String(text)
    .replace(/[\n\r]+/g, " ")
    .replace(/[\[\]\(\)\{\}\"\'\<\>\;\#\|]/g, "")
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/**
 * Generates valid Mermaid.js syntax for Figma MCP generate_diagram tool
 */
export function generateMermaidForArtefact(
  artefactType: string,
  title: string,
  data: any = {}
): string {
  if (artefactType === "user-flow") {
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const connections = Array.isArray(data.connections) ? data.connections : [];
    const lines: string[] = ["flowchart TD"];
    lines.push(`  %% User Flow: ${escapeMermaidText(title)}`);

    const startTrigger = escapeMermaidText(data.startTrigger || "User Initiates Flow");
    lines.push(`  START(["Start: ${startTrigger}"])`);

    if (nodes.length > 0) {
      lines.push(`  START --> N0`);
    }

    nodes.forEach((n: any, idx: number) => {
      const id = `N${idx}`;
      const cleanLabel = escapeMermaidText(n.label || `Step ${idx + 1}`);
      const cleanDesc = n.description ? `: ${escapeMermaidText(n.description)}` : "";
      const text = `${cleanLabel}${cleanDesc}`;

      if (n.type === "decision") {
        lines.push(`  ${id}{"${text}?"}`);
      } else if (n.type === "end") {
        lines.push(`  ${id}(["${text}"])`);
      } else if (n.type === "screen") {
        lines.push(`  ${id}[["Screen: ${text}"]]`);
      } else {
        lines.push(`  ${id}["${text}"]`);
      }
    });

    if (connections.length > 0) {
      connections.forEach((c: any) => {
        const fromIdx = nodes.findIndex((n: any) => n.id === c.from);
        const toIdx = nodes.findIndex((n: any) => n.id === c.to);
        const fromId = fromIdx !== -1 ? `N${fromIdx}` : null;
        const toId = toIdx !== -1 ? `N${toIdx}` : null;
        if (fromId && toId) {
          if (c.conditionLabel) {
            lines.push(`  ${fromId} -->|${escapeMermaidText(c.conditionLabel)}| ${toId}`);
          } else {
            lines.push(`  ${fromId} --> ${toId}`);
          }
        }
      });
    } else {
      for (let i = 0; i < nodes.length - 1; i++) {
        lines.push(`  N${i} --> N${i + 1}`);
      }
    }

    const endOutcome = escapeMermaidText(data.endOutcome || "Flow Completed");
    lines.push(`  END(["End: ${endOutcome}"])`);
    if (nodes.length > 0) {
      const lastId = `N${nodes.length - 1}`;
      lines.push(`  ${lastId} --> END`);
    }

    return lines.join("\n");
  }

  if (artefactType === "user-journey-map") {
    const phases = Array.isArray(data.phases) ? data.phases : [];
    const lines: string[] = ["flowchart LR"];
    lines.push(`  %% Journey Map: ${escapeMermaidText(title)}`);

    phases.forEach((p: any, idx: number) => {
      const pId = `P${idx}`;
      const phaseName = escapeMermaidText(p.phaseName || `Phase ${idx + 1}`);
      lines.push(`  subgraph ${pId} ["Phase ${idx + 1}: ${phaseName}"]`);
      if (p.userActions && p.userActions.length > 0) {
        lines.push(`    A${idx}["Actions: ${escapeMermaidText(p.userActions.slice(0, 3).join(", "))}"]`);
      }
      if (p.userThoughts) {
        lines.push(`    T${idx}(["Thoughts: ${escapeMermaidText(p.userThoughts)}"])`);
      }
      if (p.painPoints && p.painPoints.length > 0) {
        lines.push(`    PP${idx}>"Pain Points: ${escapeMermaidText(p.painPoints.slice(0, 2).join(", "))}"]`);
      }
      if (p.opportunities && p.opportunities.length > 0) {
        lines.push(`    OP${idx}{{"Opportunities: ${escapeMermaidText(p.opportunities.slice(0, 2).join(", "))}"}}`);
      }
      lines.push(`  end`);
      if (idx > 0) {
        lines.push(`  P${idx - 1} --> P${idx}`);
      }
    });

    return lines.join("\n");
  }

  if (artefactType === "affinity-map") {
    const themes = Array.isArray(data.themes) ? data.themes : [];
    const lines: string[] = ["flowchart TB"];
    lines.push(`  %% Affinity Map: ${escapeMermaidText(title)}`);
    themes.forEach((t: any, tIdx: number) => {
      if (!Array.isArray(t.clusters) || t.clusters.length === 0) return;
      lines.push(`  subgraph T${tIdx} ["${escapeMermaidText(t.name || `Theme ${tIdx + 1}`)}"]`);
      (Array.isArray(t.clusters) ? t.clusters : []).forEach((c: any, cIdx: number) => {
        lines.push(`    T${tIdx}C${cIdx}["${escapeMermaidText(c.label || `Cluster ${cIdx + 1}`)}"]`);
        (Array.isArray(c.notes) ? c.notes : []).forEach((n: any, nIdx: number) => {
          lines.push(`    T${tIdx}C${cIdx}N${nIdx}("${escapeMermaidText(n.text)}")`);
          lines.push(`    T${tIdx}C${cIdx} --- T${tIdx}C${cIdx}N${nIdx}`);
        });
      });
      lines.push(`  end`);
    });
    return lines.join("\n");
  }

  // Wireframe layout
  const sections = Array.isArray(data.layoutStructure?.mainSections)
    ? data.layoutStructure.mainSections
    : [];
  const lines: string[] = ["flowchart TD"];
  lines.push(`  subgraph WF ["Wireframe: ${escapeMermaidText(title)}"]`);
  lines.push(`    NAV["Top Navigation Bar"]`);
  sections.forEach((s: any, idx: number) => {
    const sId = `SEC${idx}`;
    const sTitle = escapeMermaidText(s.sectionTitle || `Section ${idx + 1}`);
    const sContent = escapeMermaidText(s.contentType || "Component");
    lines.push(`    ${sId}["${sTitle} (${sContent})"]`);
    if (idx === 0) {
      lines.push(`    NAV --> ${sId}`);
    } else {
      lines.push(`    SEC${idx - 1} --> ${sId}`);
    }
  });
  lines.push(`  end`);
  return lines.join("\n");
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * FigJam MCP Tools Specification
 */
export const FIGJAM_MCP_TOOLS = [
  {
    name: "generate_diagram",
    description:
      "Generates an editable native FigJam diagram (user flow flowchart, journey map, wireframe) from Mermaid.js syntax using Figma MCP protocol.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: {
          type: "string",
          description: "Target FigJam board URL or file key (if omitted, uses the FigJam file the Desktop Bridge plugin is open in)",
        },
        diagram: {
          type: "string",
          description: "Mermaid.js diagram syntax",
        },
        prompt: {
          type: "string",
          description: "Natural language description of the diagram",
        },
        token: {
          type: "string",
          description: "Optional Figma Personal Access Token",
        },
      },
      required: ["diagram"],
    },
  },
  {
    name: "use_figma",
    description:
      "Executes native Figma Plugin API code to create shapes, connectors, sections, and text directly on the canvas.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: {
          type: "string",
          description: "Target FigJam board URL or file key",
        },
        code: {
          type: "string",
          description: "Figma Plugin API JavaScript code",
        },
        token: {
          type: "string",
          description: "Optional Figma Personal Access Token",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "read_figjam_file",
    description:
      "Reads nodes, sticky notes, sections, text, and structure from a live FigJam file using the Model Context Protocol.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: {
          type: "string",
          description: "FigJam board URL or file key to read",
        },
        token: {
          type: "string",
          description: "Optional Figma Personal Access Token",
        },
      },
      required: ["fileKey"],
    },
  },
  {
    name: "write_figjam_artefact",
    description:
      "Writes a generated visual artefact (wireframe, user flow, journey map, or affinity map) to a FigJam board using the Model Context Protocol.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: {
          type: "string",
          description: "Target FigJam board URL or file key",
        },
        artefactType: {
          type: "string",
          enum: ["wireframe", "user-journey-map", "user-flow", "affinity-map"],
          description: "The visual artefact type",
        },
        title: {
          type: "string",
          description: "Title of the visual artefact",
        },
        artefactData: {
          type: "object",
          description: "Structured design specifications for the artefact",
        },
        token: {
          type: "string",
          description: "Optional Figma Personal Access Token",
        },
      },
      required: ["artefactType", "title", "artefactData"],
    },
  },
  {
    name: "figjam_create_user_flow",
    description:
      "Creates flowchart nodes, capsules, decision diamonds, labeled connector arrows, and edge-case sticky notes inside a FigJam board.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string" },
        title: { type: "string" },
        userFlowData: { type: "object" },
      },
      required: ["title", "userFlowData"],
    },
  },
  {
    name: "figjam_create_journey_map",
    description:
      "Creates journey map phase sections, action stickies, thought notes, sentiment badges, and opportunity cards in FigJam.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string" },
        title: { type: "string" },
        journeyMapData: { type: "object" },
      },
      required: ["title", "journeyMapData"],
    },
  },
  {
    name: "figjam_create_wireframe",
    description:
      "Creates responsive device frames, wireframe section blocks, interactive state elements, and sticky annotations in FigJam.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string" },
        title: { type: "string" },
        wireframeData: { type: "object" },
      },
      required: ["title", "wireframeData"],
    },
  },
  {
    name: "figjam_create_stickies",
    description: "Batch creates native sticky notes in FigJam with custom text, positions, and colors.",
    inputSchema: {
      type: "object",
      properties: {
        fileKey: { type: "string" },
        stickies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              color: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
            },
          },
        },
      },
      required: ["stickies"],
    },
  },
  {
    name: "figjam_create_shape_with_text",
    description: "Creates flowchart geometric shapes with embedded text in FigJam.",
    inputSchema: {
      type: "object",
      properties: {
        shapeType: { type: "string" },
        text: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["shapeType", "text"],
    },
  },
  {
    name: "figjam_get_bridge_status",
    description: "Checks connectivity with the Figma Desktop Bridge WebSocket plugin.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "figjam_ping",
    description: "Verifies connectivity and protocol handshake with the FigJam MCP server.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Handle MCP JSON-RPC 2.0 Request
 */
export async function handleFigjamMcpRequest(req: Request, res: Response) {
  const body = req.body || {};
  const { jsonrpc, id, method, params } = body;

  if (jsonrpc !== "2.0") {
    res.status(400).json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid Request: jsonrpc must be '2.0'" },
    });
    return;
  }

  try {
    switch (method) {
      // 1. Initialize
      case "initialize":
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "FigJam MCP Server",
              version: "1.1.0",
              description:
                "Model Context Protocol server for reading and creating native FigJam board elements (stickies, shapes, connectors).",
            },
            capabilities: {
              tools: { listChanged: false },
            },
          },
        });
        return;

      // 2. Ping
      case "ping":
      case "figjam_ping":
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            status: "ok",
            server: "FigJam MCP Server",
            bridgeConnectedClients: bridgeClients.size,
            bridgePort: bridgePortActive,
            timestamp: new Date().toISOString(),
          },
        });
        return;

      // 3. Tools Listing
      case "tools/list":
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: FIGJAM_MCP_TOOLS,
          },
        });
        return;

      // 4. Tools Call
      case "tools/call": {
        const { name, arguments: args = {} } = params || {};

        // TOOL: BRIDGE STATUS
        if (name === "figjam_get_bridge_status") {
          await refreshBridgeFileInfo();
          const figjamClient = findFigjamBridgeClient(extractFigmaFileKey(args.fileKey || "") || null);
          res.json({
            jsonrpc: "2.0",
            id,
            result: {
              connected: bridgeClients.size > 0,
              connectedClients: bridgeClients.size,
              figjamReady: !!figjamClient,
              figjamFileName: figjamClient?.fileInfo?.fileName || null,
              figjamFileKey: figjamClient?.fileInfo?.fileKey || null,
              figjamEditorType: figjamClient?.fileInfo?.editorType || null,
              clients: listBridgeClients(),
              port: bridgePortActive,
              protocol: "ws-jsonrpc",
            },
          });
          return;
        }

        // TOOL: READ FIGJAM FILE
        if (name === "read_figjam_file") {
          const rawKey = args.fileKey || "";
          const fileKey = extractFigmaFileKey(rawKey) || rawKey;
          const token =
            args.token ||
            (req.headers["x-figma-token"] as string) ||
            process.env.FIGMA_ACCESS_TOKEN ||
            "";

          if (!fileKey) {
            res.status(400).json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32602,
                message: "Missing or invalid fileKey for FigJam file.",
              },
            });
            return;
          }

          let fileData: any = null;
          const stickiesFound: string[] = [];
          const framesFound: string[] = [];

          if (token) {
            try {
              const figmaRes = await fetch(
                `https://api.figma.com/v1/files/${fileKey}`,
                {
                  headers: { "X-Figma-Token": token },
                }
              );

              if (figmaRes.ok) {
                fileData = await figmaRes.json();
                const traverse = (node: any) => {
                  if (!node) return;
                  if (
                    node.type === "STICKY" ||
                    node.name?.toLowerCase().includes("sticky")
                  ) {
                    stickiesFound.push(node.characters || node.name || "Sticky Note");
                  }
                  if (node.type === "FRAME" || node.type === "SECTION") {
                    framesFound.push(node.name || "Frame");
                  }
                  if (node.children && Array.isArray(node.children)) {
                    node.children.forEach(traverse);
                  }
                };
                traverse(fileData.document);
              }
            } catch (err) {
              console.warn("Figma API fetch warning:", err);
            }
          }

          const fileUrl = figmaFileUrl(fileKey, fileData?.editorType);
          const embedUrl = `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(
            fileUrl
          )}`;

          res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: fileData
                    ? `Successfully read FigJam board "${fileData.name}" via MCP. Extracted ${framesFound.length} frames and ${stickiesFound.length} sticky notes.`
                    : `Connected to FigJam board (${fileKey}). Ready to insert visual artefacts.`,
                },
              ],
              fileKey,
              fileUrl,
              embedUrl,
              fileName: fileData?.name || `Figma file (${fileKey})`,
              editorType: fileData?.editorType || null,
              lastModified: fileData?.lastModified || new Date().toISOString(),
              stickies: stickiesFound,
              frames: framesFound,
            },
          });
          return;
        }

        // TOOL: WRITE FIGJAM ARTEFACT & SPECIALIZED CREATORS
        if (
          name === "write_figjam_artefact" ||
          name === "generate_diagram" ||
          name === "use_figma" ||
          name === "figjam_create_wireframe" ||
          name === "figjam_create_journey_map" ||
          name === "figjam_create_user_flow" ||
          name === "figjam_create_stickies"
        ) {
          const artefactType =
            args.artefactType ||
            (name === "figjam_create_wireframe"
              ? "wireframe"
              : name === "figjam_create_journey_map"
              ? "user-journey-map"
              : name === "figjam_create_user_flow"
              ? "user-flow"
              : "user-flow");

          const title = args.title || "Visual Artefact";
          const data =
            args.artefactData ||
            args.userFlowData ||
            args.journeyMapData ||
            args.wireframeData ||
            args ||
            {};

          const requestedKey = extractFigmaFileKey(args.fileKey || "") || null;

          const mermaidDiagram = args.diagram || generateMermaidForArtefact(artefactType, title, data);
          const canvasPayload = generateFigjamCanvasElements(artefactType, title, data);
          const pluginCode = args.code || generateFigjamPluginCode(canvasPayload);

          // Real FigJam nodes can only be made by Plugin API code running in an open file.
          // Personal access tokens cannot create files or nodes, and mcp.figma.com only accepts
          // OAuth from Figma-approved clients, so the Desktop Bridge plugin is the write path.
          const client = findFigjamBridgeClient(requestedKey);
          if (!client) {
            const otherEditors = listBridgeClients().filter(
              (c) => c.editorType && !DRAWABLE_EDITOR_TYPES.includes(c.editorType)
            );
            res.status(409).json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32001,
                message:
                  otherEditors.length > 0
                    ? `The Figma Desktop Bridge plugin is open in "${otherEditors[0].fileName}", which is not a FigJam or Figma Design file. Open the project's file in Figma Desktop and run the Desktop Bridge plugin there.`
                    : "No Figma file is connected. Open the project's FigJam or Figma Design file in Figma Desktop and run Plugins > Development > Figma Desktop Bridge, then generate again.",
              },
            });
            return;
          }

          // Each project owns one Figma file, so never fall back to drawing into a different open file
          const clientFileKey = client.fileInfo?.fileKey || null;
          if (requestedKey && clientFileKey && clientFileKey !== requestedKey) {
            res.status(409).json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32003,
                message: `This project draws into a different Figma file, but the Desktop Bridge is running in "${client.fileInfo?.fileName || clientFileKey}". Open ${figmaFileUrl(requestedKey)} in Figma Desktop, run Plugins > Development > Figma Desktop Bridge there, then generate again.`,
              },
            });
            return;
          }

          let drawResult: any;
          try {
            drawResult = await executeInFigjam(client, pluginCode, 30000);
          } catch (err: any) {
            res.status(502).json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32002,
                message: `Figma could not draw "${title}": ${err?.message || "unknown plugin error"}`,
              },
            });
            return;
          }

          const fileKey = drawResult?.fileKey || client.fileInfo?.fileKey || null;
          const nodeParam = drawResult?.sectionId
            ? `?node-id=${encodeURIComponent(String(drawResult.sectionId).replace(":", "-"))}`
            : "";
          const editorType = drawResult?.editorType || client.fileInfo?.editorType || null;
          const fileUrl = fileKey ? `${figmaFileUrl(fileKey, editorType)}${nodeParam}` : null;
          const embedUrl = fileUrl
            ? `https://www.figma.com/embed?embed_host=astra&url=${encodeURIComponent(fileUrl)}`
            : null;
          const fileName = drawResult?.fileName || client.fileInfo?.fileName || "Figma file";
          const where = drawResult?.newPage
            ? `on new page "${drawResult.pageName}" in "${fileName}"`
            : `in "${fileName}"`;

          res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Drew "${title}" ${where}: ${drawResult?.screens ? `${drawResult.screens} screen(s), ` : ""}${drawResult?.shapes ?? 0} shapes, ${drawResult?.stickies ?? 0} stickies, ${drawResult?.connectors ?? 0} connectors.`,
                },
              ],
              fileKey,
              fileUrl,
              embedUrl,
              fileName,
              editorType,
              pageName: drawResult?.pageName || null,
              sectionId: drawResult?.sectionId || null,
              title,
              artefactType,
              syncStatus: "created-via-desktop-bridge",
              mermaidDiagram,
              canvasPayload,
              writtenAt: new Date().toISOString(),
            },
          });
          return;
        }

        // TOOL: PING
        if (name === "figjam_ping") {
          res.json({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `FigJam MCP Server is online. Desktop Bridge clients: ${bridgeClients.size}.`,
                },
              ],
              bridgeClients: bridgeClients.size,
              bridgePort: bridgePortActive,
            },
          });
          return;
        }

        res.status(404).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool not found: ${name}` },
        });
        return;
      }

      default:
        res.status(404).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
        return;
    }
  } catch (err: any) {
    console.error("FigJam MCP Server error:", err);
    res.status(500).json({
      jsonrpc: "2.0",
      id: id || null,
      error: {
        code: -32603,
        message: err?.message || "Internal MCP Server error",
      },
    });
  }
}

