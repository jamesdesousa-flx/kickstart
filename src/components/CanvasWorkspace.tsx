/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { FigmaLogo } from "./ProductLogo";
import { figmaProductName } from "../services/figjamMcpService";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Upload,
  X,
  CopyPlus,
  FileText,
  Files,
  Plus,
  Check,
  MessageSquareQuote,
  FlaskConical,
  UserCheck,
  GitFork,
  Compass,
  StickyNote,
  NotebookText,
  Layout,
  ListChecks,
  Layers,
  RefreshCw,
  Eye,
} from "lucide-react";
import {
  CanvasNode,
  CanvasEdge,
  ArtefactType,
  UploadedDocument,
} from "../types/artefacts";
import { DriveFolderCard } from "./DriveFolderCard";
import { StickyNoteCard } from "./StickyNoteCard";
import { CanvasToolbar, CanvasTool, CANVAS_TOOLS } from "./CanvasToolbar";

interface CanvasWorkspaceProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  activeDetailNodeId?: string | null;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onAddEdge: (from: string, to: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onOpenDetailView: (nodeId: string) => void;
  onGenerateArtefact?: (nodeId: string) => void;
  onDropArtefact: (type: ArtefactType, position: { x: number; y: number }) => void;
  /** Populated with a function returning the top-left position that centres a new node in the visible canvas */
  viewportCenterRef?: React.MutableRefObject<((type: ArtefactType) => { x: number; y: number }) | null>;
  onOpenLibrary: () => void;
  isLibraryOpen: boolean;
  googleAccessToken?: string | null;
  onGoogleSignIn?: () => Promise<string | null>;
}

const CARD_WIDTH = 320;
const CONTEXT_CARD_WIDTH = 340;
const STICKY_NOTE_WIDTH = 220;

const getNodeWidth = (node: CanvasNode) => {
  if (node.type === "sticky-note") return STICKY_NOTE_WIDTH;
  return node.type === "context" || node.type === "document" || node.type === "drive-folder"
    ? CONTEXT_CARD_WIDTH
    : CARD_WIDTH;
};

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  nodes,
  edges,
  activeDetailNodeId,
  onUpdateNode,
  onRemoveNode,
  onDuplicateNode,
  onAddEdge,
  onRemoveEdge,
  onOpenDetailView,
  onGenerateArtefact,
  onDropArtefact,
  viewportCenterRef,
  googleAccessToken,
  onGoogleSignIn,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");

  // Tool keyboard shortcuts (ignored while typing); Escape returns to select
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setActiveTool("select");
        return;
      }
      const tool = CANVAS_TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool) setActiveTool(tool.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Pan dragging state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  // Connecting wire state
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Selected edge for deletion
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Node DOM heights map for connector alignment
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Measure card heights dynamically
  useEffect(() => {
    const newHeights: Record<string, number> = {};
    for (const node of nodes) {
      const el = nodeRefs.current[node.id];
      if (el) {
        newHeights[node.id] = el.offsetHeight;
      }
    }
    setNodeHeights(newHeights);
  }, [nodes]);

  // Convert screen coordinates to canvas space
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const x = (clientX - rect.left - pan.x) / zoom;
      const y = (clientY - rect.top - pan.y) / zoom;
      return { x, y };
    },
    [pan, zoom]
  );

  // Expose the centre of the visible canvas (excluding the overlaid library panel)
  useEffect(() => {
    if (!viewportCenterRef) return;
    viewportCenterRef.current = (type) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const panelRect = document.getElementById("artefact-library-panel")?.getBoundingClientRect();
      const left = panelRect ? Math.max(rect.left, panelRect.right) : rect.left;
      const center = screenToCanvas((left + rect.right) / 2, (rect.top + rect.bottom) / 2);
      const width = getNodeWidth({ type } as CanvasNode);
      return {
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - 80),
      };
    };
    return () => {
      viewportCenterRef.current = null;
    };
  }, [viewportCenterRef, screenToCanvas]);

  // Canvas Mouse Down (Panning)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left-click
    const target = e.target as HTMLElement;
    if (
      target === containerRef.current ||
      target.tagName === "svg" ||
      target.id === "canvas-bg"
    ) {
      if (activeTool === "sticky-note") {
        const canvasPos = screenToCanvas(e.clientX, e.clientY);
        onDropArtefact("sticky-note", {
          x: Math.round(canvasPos.x - STICKY_NOTE_WIDTH / 2),
          y: Math.round(canvasPos.y - 20),
        });
        setActiveTool("select");
        return;
      }
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedEdgeId(null);
      if (connectingFromId) {
        setConnectingFromId(null);
        setConnectingMousePos(null);
      }
    }
  };

  // Canvas Mouse Move (Panning, Dragging Node, Drawing Wire)
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (draggingNodeId) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const newX = Math.round(canvasPos.x - nodeDragOffset.x);
      const newY = Math.round(canvasPos.y - nodeDragOffset.y);
      onUpdateNode(draggingNodeId, { position: { x: newX, y: newY } });
      return;
    }

    if (connectingFromId) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setConnectingMousePos(canvasPos);
    }
  };

  // Canvas Mouse Up
  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Damped, smooth zoom sensitivity (not sensitive/jumpy)
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = -e.deltaY * 0.0012;
      setZoom((prev) => {
        const next = prev * (1 + zoomDelta);
        return Math.min(2.0, Math.max(0.4, Math.round(next * 1000) / 1000));
      });
    } else {
      // Normal scroll pans canvas gently
      setPan((prev) => ({
        x: prev.x - e.deltaX * 0.8,
        y: prev.y - e.deltaY * 0.8,
      }));
    }
  };

  // Drag-and-drop from Artefact Library
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(
      "application/kickstart-artefact-type"
    ) as ArtefactType;
    if (type) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      onDropArtefact(type, {
        x: Math.round(canvasPos.x - 140),
        y: Math.round(canvasPos.y - 70),
      });
    }
  };

  // Node mousedown (start dragging node), ignoring interactive controls
  const handleNodeDragStart = (
    e: React.MouseEvent,
    nodeId: string,
    currentPos: { x: number; y: number }
  ) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'input, textarea, select, button, a, label, [contenteditable="true"], [role="button"]'
      )
    ) {
      return;
    }
    e.stopPropagation();
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setDraggingNodeId(nodeId);
    setNodeDragOffset({
      x: canvasPos.x - currentPos.x,
      y: canvasPos.y - currentPos.y,
    });
  };

  // Output port handle mousedown (start connection)
  const handleStartConnection = (e: React.MouseEvent, fromNodeId: string) => {
    e.stopPropagation();
    setConnectingFromId(fromNodeId);
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setConnectingMousePos(canvasPos);
  };

  // Input port handle mouseup or click (complete connection)
  const handleCompleteConnection = (e: React.MouseEvent, toNodeId: string) => {
    e.stopPropagation();
    if (connectingFromId && connectingFromId !== toNodeId) {
      onAddEdge(connectingFromId, toNodeId);
    }
    setConnectingFromId(null);
    setConnectingMousePos(null);
  };

  // Helper to compute node port positions
  const getNodePortPos = (node: CanvasNode, type: "input" | "output") => {
    const width = getNodeWidth(node);
    const height = nodeHeights[node.id] || 180;
    const yCenter = node.position.y + height / 2;

    if (type === "input") {
      return { x: node.position.x, y: yCenter };
    } else {
      return { x: node.position.x + width, y: yCenter };
    }
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitView = () => {
    if (nodes.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const w = getNodeWidth(node);
      const h = nodeHeights[node.id] || 180;
      if (node.position.x < minX) minX = node.position.x;
      if (node.position.y < minY) minY = node.position.y;
      if (node.position.x + w > maxX) maxX = node.position.x + w;
      if (node.position.y + h > maxY) maxY = node.position.y + h;
    }

    const margin = 80;
    const containerW = containerRef.current?.clientWidth || 1000;
    const containerH = containerRef.current?.clientHeight || 800;
    const contentW = maxX - minX + margin * 2;
    const contentH = maxY - minY + margin * 2;

    const newZoom = Math.min(1.2, Math.max(0.4, Math.min(containerW / contentW, containerH / contentH)));
    const newPanX = (containerW - contentW * newZoom) / 2 - minX * newZoom + margin * newZoom;
    const newPanY = (containerH - contentH * newZoom) / 2 - minY * newZoom + margin * newZoom;

    setZoom(Math.round(newZoom * 100) / 100);
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  return (
    <div
      ref={containerRef}
      id="canvas-workspace"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative w-full h-full overflow-hidden select-none bg-slate-50 ${
        activeTool === "sticky-note" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        backgroundImage: `radial-gradient(#94A3B8 0.75px, transparent 0.75px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Zoom Controls */}
      <div className="absolute right-4 bottom-4 z-20 flex items-center gap-1 bg-white/95 border border-slate-200 p-1 rounded-lg shadow-sm">
        <button
          onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
          className="p-1 hover:bg-slate-100 text-slate-600 rounded transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span
          onClick={handleResetZoom}
          className="text-[11px] font-mono text-slate-600 px-1 cursor-pointer hover:text-slate-900"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
          className="p-1 hover:bg-slate-100 text-slate-600 rounded transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3 bg-slate-200 mx-0.5" />
        <button
          onClick={handleFitView}
          className="p-1 hover:bg-slate-100 text-slate-600 rounded transition-colors"
          title="Fit view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <CanvasToolbar activeTool={activeTool} onSelectTool={setActiveTool} />

      {/* Canvas Layer */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* SVG Edges Layer */}
        <svg
          className="absolute overflow-visible pointer-events-auto"
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#64748B" />
            </marker>
            <marker
              id="arrowhead-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#EF4444" />
            </marker>
          </defs>

          {/* Render Existing Edges */}
          {edges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const start = getNodePortPos(fromNode, "output");
            const end = getNodePortPos(toNode, "input");

            const dx = Math.abs(end.x - start.x) * 0.5;
            const cx1 = start.x + Math.max(dx, 40);
            const cy1 = start.y;
            const cx2 = end.x - Math.max(dx, 40);
            const cy2 = end.y;

            const d = `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;
            const isSelected = selectedEdgeId === edge.id;

            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;

            return (
              <g key={edge.id}>
                {/* Invisible hover area */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdgeId(isSelected ? null : edge.id);
                  }}
                />
                {/* Visible curve */}
                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? "#EF4444" : "#64748B"}
                  strokeWidth={isSelected ? 2.5 : 1.8}
                  markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
                  className="transition-colors"
                />

                {isSelected && (
                  <g
                    transform={`translate(${midX - 10}, ${midY - 10})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveEdge(edge.id);
                      setSelectedEdgeId(null);
                    }}
                    className="cursor-pointer"
                  >
                    <circle cx="10" cy="10" r="10" fill="#EF4444" />
                    <text
                      x="10"
                      y="14"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="12"
                      fontWeight="bold"
                    >
                      ×
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Active drawing wire */}
          {connectingFromId && connectingMousePos && (
            (() => {
              const fromNode = nodes.find((n) => n.id === connectingFromId);
              if (!fromNode) return null;
              const start = getNodePortPos(fromNode, "output");
              const end = connectingMousePos;
              const dx = Math.abs(end.x - start.x) * 0.5;
              const cx1 = start.x + Math.max(dx, 40);
              const cy1 = start.y;
              const cx2 = end.x - Math.max(dx, 40);
              const cy2 = end.y;
              const d = `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;

              return (
                <path
                  d={d}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              );
            })()
          )}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => (
          <div
            key={node.id}
            ref={(el) => {
              nodeRefs.current[node.id] = el;
            }}
            style={{
              position: "absolute",
              left: `${node.position.x}px`,
              top: `${node.position.y}px`,
              width: `${getNodeWidth(node)}px`,
            }}
            onMouseDown={(e) => handleNodeDragStart(e, node.id, node.position)}
            className="pointer-events-auto cursor-grab active:cursor-grabbing"
          >
            {node.type === "sticky-note" ? (
              <StickyNoteCard
                node={node}
                onUpdateNode={onUpdateNode}
                onRemoveNode={onRemoveNode}
                onDuplicateNode={onDuplicateNode}
                onDragStart={(e) => handleNodeDragStart(e, node.id, node.position)}
              />
            ) : node.type === "context" ? (
              <ContextCard
                node={node}
                onUpdateNode={onUpdateNode}
                onRemoveNode={onRemoveNode}
                onDuplicateNode={onDuplicateNode}
                onDragStart={(e) => handleNodeDragStart(e, node.id, node.position)}
                onStartConnection={(e) => handleStartConnection(e, node.id)}
                onCompleteConnection={(e) => handleCompleteConnection(e, node.id)}
                isConnecting={Boolean(connectingFromId)}
                isCurrentConnectingSource={connectingFromId === node.id}
              />
            ) : node.type === "document" ? (
              <DocumentCard
                node={node}
                onUpdateNode={onUpdateNode}
                onRemoveNode={onRemoveNode}
                onDuplicateNode={onDuplicateNode}
                onDragStart={(e) => handleNodeDragStart(e, node.id, node.position)}
                onStartConnection={(e) => handleStartConnection(e, node.id)}
                onCompleteConnection={(e) => handleCompleteConnection(e, node.id)}
                isConnecting={Boolean(connectingFromId)}
                isCurrentConnectingSource={connectingFromId === node.id}
              />
            ) : node.type === "drive-folder" ? (
              <DriveFolderCard
                node={node}
                onUpdateNode={onUpdateNode}
                onRemoveNode={onRemoveNode}
                onDuplicateNode={onDuplicateNode}
                onDragStart={(e) => handleNodeDragStart(e, node.id, node.position)}
                onStartConnection={(e) => handleStartConnection(e, node.id)}
                onCompleteConnection={(e) => handleCompleteConnection(e, node.id)}
                isConnecting={Boolean(connectingFromId)}
                isCurrentConnectingSource={connectingFromId === node.id}
                googleAccessToken={googleAccessToken}
                onGoogleSignIn={onGoogleSignIn}
              />
            ) : (
              <GenerativeArtefactCard
                node={node}
                isDetailOpen={activeDetailNodeId === node.id}
                onUpdateNode={onUpdateNode}
                onRemoveNode={onRemoveNode}
                onDuplicateNode={onDuplicateNode}
                onOpenDetailView={() => onOpenDetailView(node.id)}
                onGenerateArtefact={() => onGenerateArtefact?.(node.id)}
                onDragStart={(e) => handleNodeDragStart(e, node.id, node.position)}
                onStartConnection={(e) => handleStartConnection(e, node.id)}
                onCompleteConnection={(e) => handleCompleteConnection(e, node.id)}
                isConnecting={Boolean(connectingFromId)}
                isCurrentConnectingSource={connectingFromId === node.id}
                upstreamSourcesCount={
                  edges.filter((e) => e.to === node.id).length
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ==========================================================================
   Context Card Component (Pure Context Input Block)
   ========================================================================== */

interface ContextCardProps {
  node: CanvasNode;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onStartConnection: (e: React.MouseEvent) => void;
  onCompleteConnection: (e: React.MouseEvent) => void;
  isConnecting: boolean;
  isCurrentConnectingSource: boolean;
}

const ContextCard: React.FC<ContextCardProps> = ({
  node,
  onUpdateNode,
  onRemoveNode,
  onDuplicateNode,
  onDragStart,
  onStartConnection,
  onCompleteConnection,
  isConnecting,
  isCurrentConnectingSource,
}) => {
  const text = node.contextText || "";
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className="relative bg-white rounded-xl border border-slate-300 shadow-sm hover:border-slate-400 transition-colors"
    >
      {/* Input Port Connector Handle (Left side to chain contexts) */}
      <div
        onMouseUp={onCompleteConnection}
        title="Connect upstream block here to chain"
        className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-xs flex items-center justify-center transition-all z-10 ${
          isConnecting && !isCurrentConnectingSource
            ? "bg-slate-700 scale-110 cursor-pointer"
            : "bg-slate-300 hover:bg-slate-500 cursor-pointer"
        }`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
      </div>

      {/* Output Port Connector Handle (Right side) */}
      <div
        onMouseDown={onStartConnection}
        title="Drag connection wire to downstream assets"
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
          <FileText className="w-3.5 h-3.5 text-slate-700 shrink-0" />
          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
            className="text-xs font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-600 focus:bg-white focus:outline-none px-1 rounded transition-colors w-full"
            placeholder="Context Title"
          />
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0 uppercase tracking-wider">
            Context
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            onClick={() => onDuplicateNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
            title="Duplicate context block"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemoveNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
            title="Delete context block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Dedicated Context Textarea */}
      <div className="p-3 space-y-2">
        <textarea
          rows={5}
          value={node.contextText || ""}
          onChange={(e) => onUpdateNode(node.id, { contextText: e.target.value })}
          placeholder="Describe project background, problem statement, target audience, business goals, or constraints..."
          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white resize-y min-h-[95px] transition-all leading-relaxed"
        />
        <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
          <span>{wordCount} words • {charCount} chars</span>
          {text.trim() ? (
            <button
              onClick={() => onUpdateNode(node.id, { contextText: "" })}
              className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              Clear
            </button>
          ) : (
            <span>Ready to wire</span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   Document Card Component (Pure Document & File Input Block)
   ========================================================================== */

interface DocumentCardProps {
  node: CanvasNode;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onStartConnection: (e: React.MouseEvent) => void;
  onCompleteConnection: (e: React.MouseEvent) => void;
  isConnecting: boolean;
  isCurrentConnectingSource: boolean;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  node,
  onUpdateNode,
  onRemoveNode,
  onDuplicateNode,
  onDragStart,
  onStartConnection,
  onCompleteConnection,
  isConnecting,
  isCurrentConnectingSource,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documents = node.documents || [];
  const [isDragging, setIsDragging] = useState(false);
  const [showPasteSnippet, setShowPasteSnippet] = useState(false);
  const [snippetTitle, setSnippetTitle] = useState("");
  const [snippetContent, setSnippetContent] = useState("");
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newDocs: UploadedDocument[] = [...documents];

    for (const file of Array.from(files)) {
      const isText =
        file.type.startsWith("text/") ||
        /\.(md|txt|csv|json|xml|html|tsv)$/i.test(file.name);

      if (isText) {
        const text = await file.text();
        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          textContent: text,
          excerpt: text.replace(/\s+/g, " ").trim().slice(0, 100),
        });
      } else {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.includes(",") ? res.split(",")[1] : res);
          };
          reader.readAsDataURL(file);
        });
        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || "application/pdf",
          size: file.size,
          base64Data: base64,
          excerpt: "Binary file",
        });
      }
    }

    onUpdateNode(node.id, { documents: newDocs });
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleAddSnippet = () => {
    if (!snippetContent.trim()) return;
    const cleanName = snippetTitle.trim()
      ? snippetTitle.trim().endsWith(".md")
        ? snippetTitle.trim()
        : `${snippetTitle.trim().replace(/\s+/g, "_")}.md`
      : `Document_${documents.length + 1}.md`;

    const newDoc: UploadedDocument = {
      id: `doc-${Date.now()}`,
      name: cleanName,
      mimeType: "text/markdown",
      size: new Blob([snippetContent]).size,
      textContent: snippetContent.trim(),
      excerpt: snippetContent.trim().replace(/\s+/g, " ").slice(0, 100),
    };

    onUpdateNode(node.id, { documents: [...documents, newDoc] });
    setSnippetTitle("");
    setSnippetContent("");
    setShowPasteSnippet(false);
  };

  const handleRemoveDoc = (docId: string) => {
    const updated = documents.filter((d) => d.id !== docId);
    onUpdateNode(node.id, { documents: updated });
    if (previewDoc?.id === docId) {
      setPreviewDoc(null);
    }
  };

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className="relative bg-white rounded-xl border border-slate-300 shadow-sm hover:border-slate-400 transition-colors"
    >
      {/* Input Port Connector Handle (Left side to chain upstream) */}
      <div
        onMouseUp={onCompleteConnection}
        title="Connect upstream block here to chain"
        className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-xs flex items-center justify-center transition-all z-10 ${
          isConnecting && !isCurrentConnectingSource
            ? "bg-slate-700 scale-110 cursor-pointer"
            : "bg-slate-300 hover:bg-slate-500 cursor-pointer"
        }`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
      </div>

      {/* Output Port Connector Handle (Right side) */}
      <div
        onMouseDown={onStartConnection}
        title="Drag connection wire to downstream assets"
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
          <Files className="w-3.5 h-3.5 text-slate-700 shrink-0" />
          <input
            type="text"
            value={node.title}
            onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
            className="text-xs font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-600 focus:bg-white focus:outline-none px-1 rounded transition-colors w-full"
            placeholder="Document Title"
          />
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0 uppercase tracking-wider">
            Document
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            onClick={() => onDuplicateNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
            title="Duplicate document block"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemoveNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
            title="Delete document block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Dedicated Document Upload, Paste & List */}
      <div className="p-3 space-y-2.5">
        {/* Upload dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`cursor-pointer border border-dashed rounded-lg p-3 text-center transition-colors ${
            isDragging
              ? "border-blue-600 bg-blue-50/50"
              : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.docx,.csv,.json,image/*"
            onChange={(e) => {
              handleFileUpload(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          <Upload className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-[11px] font-medium text-slate-700">
            Drop files or <span className="text-blue-600 underline">browse</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            PDF, DOCX, MD, CSV, TXT
          </p>
        </div>

        {/* Action bar: document count & Paste Snippet button */}
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] text-slate-500 font-medium">
            Files ({documents.length})
          </span>
          <button
            type="button"
            onClick={() => setShowPasteSnippet((prev) => !prev)}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>{showPasteSnippet ? "Cancel" : "Paste Text"}</span>
          </button>
        </div>

        {/* Paste Snippet Form */}
        {showPasteSnippet && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <input
              type="text"
              value={snippetTitle}
              onChange={(e) => setSnippetTitle(e.target.value)}
              placeholder="Document / note title"
              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-600 text-slate-900"
            />
            <textarea
              rows={3}
              value={snippetContent}
              onChange={(e) => setSnippetContent(e.target.value)}
              placeholder="Paste research brief, interview transcript, or PRD text..."
              className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-600 text-slate-900"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={handleAddSnippet}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Add Document</span>
              </button>
            </div>
          </div>
        )}

        {/* Uploaded Documents List */}
        {documents.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100 pt-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-slate-50 text-[11px] group"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate text-slate-700 font-medium">
                    {doc.name}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 tabular-nums font-mono">
                    {formatBytes(doc.size)}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {doc.textContent && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewDoc(previewDoc?.id === doc.id ? null : doc)
                      }
                      className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                      title="Preview"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveDoc(doc.id)}
                    className="p-0.5 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline text preview snippet */}
        {previewDoc && previewDoc.textContent && (
          <div className="p-2 bg-slate-900 text-slate-100 rounded-lg text-[10px] font-mono mt-1 relative">
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
    </div>
  );
};

/* ==========================================================================
   Simplified Generative Artefact Card (Clean layout with subtle "View" button)
   ========================================================================== */

interface GenerativeArtefactCardProps {
  node: CanvasNode;
  isDetailOpen?: boolean;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onOpenDetailView: () => void;
  onGenerateArtefact: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onStartConnection: (e: React.MouseEvent) => void;
  onCompleteConnection: (e: React.MouseEvent) => void;
  isConnecting: boolean;
  isCurrentConnectingSource: boolean;
  upstreamSourcesCount: number;
}

const GenerativeArtefactCard: React.FC<GenerativeArtefactCardProps> = ({
  node,
  isDetailOpen = false,
  onUpdateNode,
  onRemoveNode,
  onDuplicateNode,
  onOpenDetailView,
  onGenerateArtefact,
  onDragStart,
  onStartConnection,
  onCompleteConnection,
  isConnecting,
  isCurrentConnectingSource,
  upstreamSourcesCount,
}) => {
  const hasData = Boolean(node.generatedData?.data);
  const isGenerating = Boolean(node.isGenerating);
  const isGeneratingClosed = isGenerating && !isDetailOpen;

  const getArtefactIcon = () => {
    switch (node.type) {
      case "interview-script":
        return <MessageSquareQuote className="w-3.5 h-3.5 text-slate-700" />;
      case "usability-script":
        return <FlaskConical className="w-3.5 h-3.5 text-slate-700" />;
      case "user-persona":
        return <UserCheck className="w-3.5 h-3.5 text-slate-700" />;
      case "user-flow":
        return <GitFork className="w-3.5 h-3.5 text-slate-700" />;
      case "user-journey-map":
        return <Compass className="w-3.5 h-3.5 text-slate-700" />;
      case "affinity-map":
        return <StickyNote className="w-3.5 h-3.5 text-slate-700" />;
      case "research-report":
        return <NotebookText className="w-3.5 h-3.5 text-slate-700" />;
      case "wireframe":
        return <Layout className="w-3.5 h-3.5 text-slate-700" />;
      case "survey-questions":
        return <ListChecks className="w-3.5 h-3.5 text-slate-700" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-slate-700" />;
    }
  };

  return (
    <div
      onDoubleClick={onOpenDetailView}
      onWheel={(e) => e.stopPropagation()}
      className={`relative bg-white rounded-xl border transition-all ${
        isGenerating
          ? "border-blue-400 ring-2 ring-blue-100 shadow-md"
          : "border-slate-300 shadow-sm hover:border-slate-400"
      }`}
    >
      {/* Top animated progress indicator when generating */}
      {isGenerating && (
        <div className="absolute -top-[1px] -left-[1px] -right-[1px] h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 rounded-t-xl overflow-hidden animate-pulse z-20">
          <div className="w-full h-full bg-white/30 animate-pulse" />
        </div>
      )}

      {/* Input Port Connector Handle (Left side) */}
      <div
        onMouseUp={onCompleteConnection}
        title="Connect input source here"
        className={`absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-xs flex items-center justify-center transition-all z-10 ${
          isConnecting && !isCurrentConnectingSource
            ? "bg-slate-700 scale-110 cursor-pointer"
            : "bg-slate-300 hover:bg-slate-500 cursor-pointer"
        }`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
      </div>

      {/* Output Port Connector Handle (Right side) */}
      <div
        onMouseDown={onStartConnection}
        title="Drag wire to connect downstream"
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
          <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            {getArtefactIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={node.title}
              onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
              className="text-xs font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-600 focus:bg-white focus:outline-none px-1 rounded transition-colors w-full block"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {/* Spinner indicator when generating */}
          {isGenerating && (
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                isGeneratingClosed
                  ? "bg-blue-100 border border-blue-300 text-blue-700 animate-pulse"
                  : "bg-blue-50 border border-blue-200 text-blue-600"
              }`}
              title={isGeneratingClosed ? "Generating in background..." : "Generating..."}
            >
              <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-600 shrink-0" />
              <span className="hidden sm:inline">Generating</span>
            </div>
          )}
          <button
            onClick={onOpenDetailView}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
            title="Open detail view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDuplicateNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
            title="Duplicate variation"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemoveNode(node.id)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
            title="Delete block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: Status and Action button */}
      <div className="p-3 flex items-center justify-between text-xs">
        {isGenerating ? (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
            <span>
              {isGeneratingClosed
                ? "Generating in background..."
                : "Generating asset..."}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            {upstreamSourcesCount > 0 ? (
              <span>
                {upstreamSourcesCount} source{upstreamSourcesCount > 1 ? "s" : ""}{" "}
                linked
              </span>
            ) : (
              <span className="text-slate-400">No inputs</span>
            )}
            {hasData && (
              <span className="ml-1.5 text-slate-700 font-medium">• Generated</span>
            )}
            {node.googleDocId && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold inline-flex items-center gap-0.5">
                <FileText className="w-2.5 h-2.5 text-blue-600" />
                <span>Doc</span>
              </span>
            )}
            {node.figjamFileId && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-purple-50 text-[#7B61FF] border border-purple-200 text-[10px] font-semibold inline-flex items-center gap-1">
                <FigmaLogo className="w-2.5 h-2.5" />
                <span>{figmaProductName(node.figjamFileUrl)}</span>
              </span>
            )}
            {node.error && (
              <span className="ml-1.5 text-rose-600 font-medium">• Failed</span>
            )}
          </div>
        )}

        {/* Action Button: "Generate" if not generated yet, "Generating..." while in progress, "View" once ready */}
        {isGenerating ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetailView();
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100 shadow-2xs cursor-pointer"
            title="Generating asset (click to view details)"
          >
            <RefreshCw className="w-3 h-3 animate-spin text-blue-600 shrink-0" />
            <span>Generating...</span>
          </button>
        ) : !hasData ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (upstreamSourcesCount === 0) return;
              onGenerateArtefact();
            }}
            disabled={upstreamSourcesCount === 0}
            className={`px-2.5 py-1 text-xs font-semibold rounded border transition-all flex items-center gap-1.5 ${
              upstreamSourcesCount === 0
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-slate-900 hover:bg-slate-800 text-white border-slate-900 shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
            }`}
            title={
              upstreamSourcesCount === 0
                ? "Connect at least one input source first to generate"
                : "Generate asset immediately"
            }
          >
            <span>Generate</span>
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetailView();
            }}
            className="px-2.5 py-1 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-200 cursor-pointer"
            title="View generated asset"
          >
            <Eye className="w-3 h-3 text-slate-500 shrink-0" />
            <span>View</span>
          </button>
        )}
      </div>
    </div>
  );
};
