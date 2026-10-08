import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Trash2,
  ExternalLink,
  Plus,
  CheckSquare,
  Square,
  GripHorizontal,
  Pencil,
  Check,
  X,
  Link2,
  ZoomIn,
  ZoomOut,
  ArrowRight,
  BookOpen,
  Eye,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  NNGMethodCatalogItem,
  RoadmapData,
  RoadmapEdge,
  RoadmapStep,
  ToolRecommendation,
} from "../data/uxrMethodsData";
import { ArtefactSymbol } from "./ArtefactSymbol";
import {
  ProductLogo,
  resolveDeliverableProduct,
  getPrimaryDeliverableLabel,
  DELIVERABLE_PRODUCTS,
  DeliverableProduct,
} from "./ProductLogo";

interface RoadmapTimelineProps {
  roadmap: RoadmapData | null;
  isGenerating: boolean;
  projectTitle?: string;
  documentsCount?: number;
  onToggleSubtask: (stepId: string, subtaskId: string) => void;
  onAddSubtask: (stepId: string, label: string) => void;
  onUpdateSubtask: (stepId: string, subtaskId: string, label: string) => void;
  onRemoveSubtask: (stepId: string, subtaskId: string) => void;
  onUpdateStep: (stepId: string, updates: Partial<RoadmapStep>) => void;
  onRemoveStep: (stepId: string) => void;
  onUpdateStepPosition: (
    stepId: string,
    position: { x: number; y: number }
  ) => void;
  onAddEdge: (fromStepId: string, toStepId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onAddCustomStep: () => void;
  onOpenSidePanelTab: (tab: "context" | "methods" | "templates") => void;
  onDropCatalogMethod?: (
    method: NNGMethodCatalogItem,
    position: { x: number; y: number }
  ) => void;
}

const CARD_WIDTH = 336;
const DEFAULT_CARD_HEIGHT = 190;

const GENERATION_STAGES = [
  {
    title: "Synthesizing project context & attached files",
  },
  {
    title: "Selecting optimal research & design artefacts",
  },
  {
    title: "Structuring phases, deliverables & action checklists",
  },
  {
    title: "Mapping your interactive strategy canvas",
  },
];

export const RoadmapTimeline: React.FC<RoadmapTimelineProps> = ({
  roadmap,
  isGenerating,
  projectTitle,
  documentsCount = 0,
  onToggleSubtask,
  onAddSubtask,
  onUpdateSubtask,
  onRemoveSubtask,
  onUpdateStep,
  onRemoveStep,
  onUpdateStepPosition,
  onAddEdge,
  onRemoveEdge,
  onAddCustomStep,
  onOpenSidePanelTab,
  onDropCatalogMethod,
}) => {
  const [loadingStageIndex, setLoadingStageIndex] = useState<number>(0);

  useEffect(() => {
    if (!isGenerating) {
      setLoadingStageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStageIndex((prev) =>
        prev < GENERATION_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 2200);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Step Detail Modal state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  // Inline subtask editing state (used inside Step Detail Modal)
  const [editingSubtask, setEditingSubtask] = useState<{
    stepId: string;
    subtaskId: string;
    value: string;
  } | null>(null);

  // New item inputs inside Step Detail Modal
  const [newSubtaskInput, setNewSubtaskInput] = useState<string>("");
  const [newDeliverableInput, setNewDeliverableInput] = useState<string>("");

  // Canvas zoom & interaction state
  const [zoom, setZoom] = useState<number>(1);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  // Dragging card state
  const [draggingCard, setDraggingCard] = useState<{
    stepId: string;
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Connecting arrow state (supports both drag-to-connect and click-to-connect)
  const [connectingFrom, setConnectingFrom] = useState<{
    stepId: string;
    mode: "drag" | "click";
    cursorX: number;
    cursorY: number;
  } | null>(null);
  const [hoveredTargetStepId, setHoveredTargetStepId] = useState<string | null>(
    null
  );
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Measure card heights so ports stay vertically centered on each card
  const updateMeasuredHeights = useCallback(() => {
    const next: Record<string, number> = {};
    for (const [id, el] of Object.entries(cardRefs.current)) {
      if (el) {
        next[id] = el.offsetHeight || DEFAULT_CARD_HEIGHT;
      }
    }
    setCardHeights(next);
  }, []);

  useEffect(() => {
    updateMeasuredHeights();
    window.addEventListener("resize", updateMeasuredHeights);
    return () => window.removeEventListener("resize", updateMeasuredHeights);
  }, [roadmap, updateMeasuredHeights]);

  // Handle card pointer drag
  useEffect(() => {
    if (!draggingCard) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = (e.clientX - draggingCard.startClientX) / zoom;
      const dy = (e.clientY - draggingCard.startClientY) / zoom;
      const nextX = Math.max(16, Math.round(draggingCard.initialX + dx));
      const nextY = Math.max(16, Math.round(draggingCard.initialY + dy));
      onUpdateStepPosition(draggingCard.stepId, { x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      setDraggingCard(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingCard, zoom, onUpdateStepPosition]);

  // Handle arrow connection pointer move / up
  useEffect(() => {
    if (!connectingFrom) return;

    const getCanvasCoordinates = (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom,
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const coords = getCanvasCoordinates(e.clientX, e.clientY);
      setConnectingFrom((prev) =>
        prev ? { ...prev, cursorX: coords.x, cursorY: coords.y } : null
      );
    };

    const handlePointerUp = () => {
      if (connectingFrom.mode === "drag") {
        if (
          hoveredTargetStepId &&
          hoveredTargetStepId !== connectingFrom.stepId
        ) {
          onAddEdge(connectingFrom.stepId, hoveredTargetStepId);
        }
        setConnectingFrom(null);
        setHoveredTargetStepId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConnectingFrom(null);
        setHoveredTargetStepId(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [connectingFrom, hoveredTargetStepId, zoom, onAddEdge]);

  // Close modal on Escape key
  useEffect(() => {
    if (!selectedStepId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editingSubtask) {
        setSelectedStepId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStepId, editingSubtask]);

  if (isGenerating) {
    return (
      <section
        aria-label="Generating Strategy"
        className="flex-1 flex flex-col p-6 overflow-y-auto relative"
      >
        <div
          role="status"
          aria-live="polite"
          className="max-w-xl w-full mx-auto my-6 bg-white border border-slate-200/95 rounded-2xl p-6 shadow-sm space-y-4 z-10"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Creating your tailored UXR &amp; design strategy
              {projectTitle?.trim() ? ` for “${projectTitle.trim()}”` : ""}...
            </h2>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            {GENERATION_STAGES.map((stage, idx) => {
              const isDone = idx < loadingStageIndex;
              const isCurrent = idx === loadingStageIndex;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                    isCurrent
                      ? "bg-blue-50/60 border border-blue-100"
                      : isDone
                      ? "opacity-75"
                      : "opacity-45"
                  }`}
                >
                  <div className="shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold ${
                        isCurrent ? "text-slate-900" : "text-slate-700"
                      }`}
                    >
                      {stage.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-50 animate-pulse pointer-events-none max-w-5xl w-full mx-auto"
        >
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 h-40"
            >
              <div className="h-3.5 bg-slate-100 rounded w-1/3" />
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-8 bg-slate-100 rounded w-full" />
              <div className="h-6 bg-slate-50 rounded w-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!roadmap || roadmap.steps.length === 0) {
    return (
      <div className="p-6">
        <section className="bg-white/90 border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-3 max-w-xl mx-auto my-12">
          <div className="text-xs font-mono font-semibold text-slate-400">
            02 · STRATEGY CANVAS
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Your Strategy Canvas is Empty
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Update your Project Context to generate a tailored strategy, or add
            artefact cards directly from the collapsible side panel.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => onOpenSidePanelTab("context")}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-xl transition-colors cursor-pointer"
            >
              Open Project Context
            </button>
            <button
              type="button"
              onClick={() => onOpenSidePanelTab("methods")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Browse Artefact Library</span>
            </button>
            <button
              type="button"
              onClick={onAddCustomStep}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Step</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  const handleCommitSubtaskEdit = () => {
    if (!editingSubtask) return;
    const trimmed = editingSubtask.value.trim();
    if (trimmed) {
      onUpdateSubtask(
        editingSubtask.stepId,
        editingSubtask.subtaskId,
        trimmed
      );
    }
    setEditingSubtask(null);
  };

  const handleAddSubtaskSubmit = (stepId: string) => {
    const val = newSubtaskInput.trim();
    if (!val) return;
    onAddSubtask(stepId, val);
    setNewSubtaskInput("");
  };

  // Compute positions for all steps
  const getStepPos = (step: RoadmapStep, index: number) => {
    if (step.position) return step.position;
    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      x: 48 + col * 410,
      y: 48 + row * 370,
    };
  };

  // Compute port coordinates for SVG arrows (centered vertically on each card)
  const getOutputPort = (step: RoadmapStep, index: number) => {
    const pos = getStepPos(step, index);
    const h = cardHeights[step.id] || DEFAULT_CARD_HEIGHT;
    return {
      x: pos.x + CARD_WIDTH,
      y: pos.y + h / 2,
    };
  };

  const getInputPort = (step: RoadmapStep, index: number) => {
    const pos = getStepPos(step, index);
    const h = cardHeights[step.id] || DEFAULT_CARD_HEIGHT;
    return {
      x: pos.x,
      y: pos.y + h / 2,
    };
  };

  // Calculate SVG path and midpoint for an edge between two points
  const buildBezierCurve = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;

    let cx1: number;
    let cy1: number;
    let cx2: number;
    let cy2: number;

    if (dx >= 40) {
      const offset = Math.max(60, Math.min(180, dx * 0.45));
      cx1 = x1 + offset;
      cy1 = y1;
      cx2 = x2 - offset;
      cy2 = y2;
    } else {
      const loopOffset = Math.max(90, Math.min(180, Math.abs(dx) * 0.35 + 80));
      cx1 = x1 + loopOffset;
      cy1 = y1 + (dy >= 0 ? 50 : -50);
      cx2 = x2 - loopOffset;
      cy2 = y2 + (dy >= 0 ? -50 : 50);
    }

    const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    const midX = 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2;
    const midY = 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2;

    return { path, midX, midY };
  };

  const edges: RoadmapEdge[] = roadmap.edges || [];

  // Determine canvas dimensions based on step positions
  const maxRight = roadmap.steps.reduce((max, s, idx) => {
    const p = getStepPos(s, idx);
    return Math.max(max, p.x + CARD_WIDTH + 160);
  }, 1320);

  const maxBottom = roadmap.steps.reduce((max, s, idx) => {
    const p = getStepPos(s, idx);
    const h = cardHeights[s.id] || DEFAULT_CARD_HEIGHT;
    return Math.max(max, p.y + h + 160);
  }, 820);

  const selectedStepIndex = selectedStepId
    ? roadmap.steps.findIndex((s) => s.id === selectedStepId)
    : -1;
  const selectedStep =
    selectedStepIndex !== -1 ? roadmap.steps[selectedStepIndex] : null;

  return (
    <section
      aria-label="Strategy Canvas"
      className="flex-1 flex flex-col min-w-0 h-full"
    >
      {/* Strategy Header & Toolbar */}
      <div className="bg-white border-b border-slate-200/90 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-slate-400">
            02
          </span>
          <h1 className="text-sm font-semibold text-slate-900 truncate">
            {roadmap.roadmapTitle}
          </h1>
        </div>

        {/* Canvas Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {connectingFrom && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-medium">
              <span>Click any target card to connect arrow</span>
              <button
                type="button"
                onClick={() => {
                  setConnectingFrom(null);
                  setHoveredTargetStepId(null);
                }}
                className="p-0.5 hover:bg-blue-100 rounded cursor-pointer"
                title="Cancel connection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))
              }
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-0.5 text-[11px] font-mono tabular-nums font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
              title="Reset Zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.min(1.35, Number((z + 0.1).toFixed(2))))
              }
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onAddCustomStep}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Step</span>
          </button>
        </div>
      </div>

      {/* Scrollable 2D Interactive Strategy Canvas */}
      <div
        className="flex-1 overflow-auto relative select-none"
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes(
              "application/x-methodmap-catalog-item"
            )
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(
            "application/x-methodmap-catalog-item"
          );
          if (!raw || !onDropCatalogMethod) return;
          e.preventDefault();
          try {
            const item: NNGMethodCatalogItem = JSON.parse(raw);
            const rect = canvasRef.current?.getBoundingClientRect();
            const dropX = rect
              ? Math.max(24, Math.round((e.clientX - rect.left - 140) / zoom))
              : 80;
            const dropY = rect
              ? Math.max(24, Math.round((e.clientY - rect.top - 80) / zoom))
              : 80;
            onDropCatalogMethod(item, { x: dropX, y: dropY });
          } catch {
            // ignore invalid payload
          }
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget || e.target === canvasRef.current) {
            if (connectingFrom) {
              setConnectingFrom(null);
              setHoveredTargetStepId(null);
            }
          }
        }}
      >
        <div
          ref={canvasRef}
          style={{
            width: `${maxRight}px`,
            height: `${maxBottom}px`,
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
          }}
          className="relative"
        >
          {/* SVG Layer for Arrows / Connections */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            style={{ overflow: "visible" }}
          >
            <defs>
              <marker
                id="strategy-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#2563EB" />
              </marker>
              <marker
                id="strategy-arrow-hover"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#DC2626" />
              </marker>
              <marker
                id="strategy-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#3B82F6" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const fromIdx = roadmap.steps.findIndex(
                (s) => s.id === edge.from
              );
              const toIdx = roadmap.steps.findIndex((s) => s.id === edge.to);
              if (fromIdx === -1 || toIdx === -1) return null;

              const fromStep = roadmap.steps[fromIdx];
              const toStep = roadmap.steps[toIdx];
              const start = getOutputPort(fromStep, fromIdx);
              const end = getInputPort(toStep, toIdx);
              const { path, midX, midY } = buildBezierCurve(
                start.x,
                start.y,
                end.x,
                end.y
              );
              const isHovered = hoveredEdgeId === edge.id;

              return (
                <g
                  key={edge.id}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                >
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveEdge(edge.id);
                    }}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={isHovered ? "#DC2626" : "#2563EB"}
                    strokeWidth={isHovered ? 2.5 : 2}
                    markerEnd={
                      isHovered
                        ? "url(#strategy-arrow-hover)"
                        : "url(#strategy-arrow)"
                    }
                    className="transition-colors"
                  />
                  {isHovered && (
                    <g
                      transform={`translate(${midX}, ${midY})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveEdge(edge.id);
                      }}
                    >
                      <circle
                        r={11}
                        fill="#FEF2F2"
                        stroke="#DC2626"
                        strokeWidth={1.5}
                      />
                      <title>Click to remove arrow connection</title>
                      <path
                        d="M -3 -3 L 3 3 M -3 3 L 3 -3"
                        stroke="#DC2626"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {connectingFrom &&
              (() => {
                const fromIdx = roadmap.steps.findIndex(
                  (s) => s.id === connectingFrom.stepId
                );
                if (fromIdx === -1) return null;
                const fromStep = roadmap.steps[fromIdx];
                const start = getOutputPort(fromStep, fromIdx);
                const { path } = buildBezierCurve(
                  start.x,
                  start.y,
                  connectingFrom.cursorX,
                  connectingFrom.cursorY
                );
                return (
                  <path
                    d={path}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    markerEnd="url(#strategy-arrow-active)"
                  />
                );
              })()}
          </svg>

          {/* Draggable Strategy Step Cards */}
          {roadmap.steps.map((step: RoadmapStep, index: number) => {
            const pos = getStepPos(step, index);
            const h = cardHeights[step.id] || DEFAULT_CARD_HEIGHT;
            const displayIndex =
              index + 1 < 10 ? `0${index + 1}` : `${index + 1}`;
            const isDraggingThis = draggingCard?.stepId === step.id;
            const isConnectSource = connectingFrom?.stepId === step.id;
            const isBeingConnected =
              Boolean(connectingFrom) && connectingFrom?.stepId !== step.id;
            const isConnectTarget =
              isBeingConnected && hoveredTargetStepId === step.id;

            const completedCount = (step.subtasks || []).filter(
              (t) => t.completed
            ).length;
            const totalSubtasks = (step.subtasks || []).length;

            return (
              <article
                key={step.id}
                ref={(el) => {
                  cardRefs.current[step.id] = el;
                }}
                style={{
                  width: `${CARD_WIDTH}px`,
                  transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
                }}
                onMouseEnter={() => {
                  if (connectingFrom && connectingFrom.stepId !== step.id) {
                    setHoveredTargetStepId(step.id);
                  }
                }}
                onMouseLeave={() => {
                  if (hoveredTargetStepId === step.id) {
                    setHoveredTargetStepId(null);
                  }
                }}
                onClick={(e) => {
                  if (connectingFrom && connectingFrom.stepId !== step.id) {
                    e.stopPropagation();
                    onAddEdge(connectingFrom.stepId, step.id);
                    setConnectingFrom(null);
                    setHoveredTargetStepId(null);
                  }
                }}
                className={`group/card absolute top-0 left-0 z-20 bg-white rounded-2xl p-4 flex flex-col justify-between transition-shadow select-text ${
                  isDraggingThis
                    ? "shadow-xl border-2 border-blue-600 z-30"
                    : isConnectTarget
                    ? "border-2 border-blue-600 shadow-lg ring-4 ring-blue-500/15 cursor-pointer"
                    : isConnectSource
                    ? "border-2 border-blue-500 shadow-md"
                    : "border border-slate-200/95 shadow-xs hover:border-slate-300"
                }`}
              >
                {/* Left Input Connector Port */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectingFrom && connectingFrom.stepId !== step.id) {
                      onAddEdge(connectingFrom.stepId, step.id);
                      setConnectingFrom(null);
                      setHoveredTargetStepId(null);
                    }
                  }}
                  title={
                    connectingFrom
                      ? `Connect arrow to ${step.title || "this card"}`
                      : "Input port"
                  }
                  className={`absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer z-30 ${
                    isConnectTarget
                      ? "opacity-100 pointer-events-auto bg-blue-600 border-white text-white scale-125 shadow-sm"
                      : isBeingConnected
                      ? "opacity-100 pointer-events-auto bg-blue-50 border-blue-500 text-blue-600 scale-110"
                      : "opacity-0 pointer-events-none scale-75 bg-white border-slate-300 text-slate-400"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current" />
                </button>

                {/* Right Output Connector Port */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const rect = canvasRef.current?.getBoundingClientRect();
                    const startX = rect
                      ? (e.clientX - rect.left) / zoom
                      : pos.x + CARD_WIDTH;
                    const startY = rect
                      ? (e.clientY - rect.top) / zoom
                      : pos.y + h / 2;
                    setConnectingFrom({
                      stepId: step.id,
                      mode: "drag",
                      cursorX: startX,
                      cursorY: startY,
                    });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = canvasRef.current?.getBoundingClientRect();
                    const startX = rect
                      ? (e.clientX - rect.left) / zoom
                      : pos.x + CARD_WIDTH + 40;
                    const startY = rect
                      ? (e.clientY - rect.top) / zoom
                      : pos.y + h / 2;
                    setConnectingFrom((prev) =>
                      prev?.stepId === step.id
                        ? null
                        : {
                            stepId: step.id,
                            mode: "click",
                            cursorX: startX,
                            cursorY: startY,
                          }
                    );
                  }}
                  title="Drag or click to connect an arrow to another card"
                  className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-crosshair z-30 ${
                    isConnectSource
                      ? "opacity-100 pointer-events-auto bg-blue-600 border-white text-white scale-125 shadow-sm"
                      : "opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto hover:opacity-100 focus:opacity-100 bg-white border-blue-500 text-blue-600 hover:bg-blue-600 hover:text-white hover:scale-110 shadow-2xs"
                  }`}
                >
                  <ArrowRight className="w-3 h-3" />
                </button>

                <div className="space-y-3">
                  {/* Draggable Card Header Bar */}
                  <div
                    onPointerDown={(e) => {
                      if (
                        (e.target as HTMLElement).closest("button") ||
                        (e.target as HTMLElement).closest("input")
                      ) {
                        return;
                      }
                      e.preventDefault();
                      setDraggingCard({
                        stepId: step.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        initialX: pos.x,
                        initialY: pos.y,
                      });
                    }}
                    className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 cursor-grab active:cursor-grabbing select-none"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0 flex-1">
                      <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {displayIndex}
                      </span>
                      <span aria-hidden="true">·</span>
                      <input
                        type="text"
                        value={step.phase}
                        onChange={(e) =>
                          onUpdateStep(step.id, { phase: e.target.value })
                        }
                        placeholder="Phase"
                        className="font-semibold text-blue-600 bg-transparent border-0 focus:outline-none focus:bg-slate-50 rounded px-1 min-w-0 flex-1 truncate placeholder:text-slate-300"
                      />
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnectingFrom((prev) =>
                            prev?.stepId === step.id
                              ? null
                              : {
                                  stepId: step.id,
                                  mode: "click",
                                  cursorX: pos.x + CARD_WIDTH + 50,
                                  cursorY: pos.y + h / 2,
                                }
                          );
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isConnectSource
                            ? "bg-blue-100 text-blue-700"
                            : "text-slate-400 hover:text-blue-600 hover:bg-slate-100"
                        }`}
                        title="Connect arrow to another card"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveStep(step.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        title="Remove card"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Symbol, Editable Title & Editable Description */}
                  <div className="flex items-start gap-2.5">
                    <ArtefactSymbol
                      iconKey={step.iconKey}
                      name={step.title}
                      className="w-4 h-4"
                      badgeClassName="w-8 h-8 rounded-xl bg-blue-50/80 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5"
                    />
                    <div className="space-y-1 min-w-0 flex-1">
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) =>
                          onUpdateStep(step.id, { title: e.target.value })
                        }
                        placeholder="Custom step title..."
                        className="w-full text-sm font-semibold text-slate-900 leading-snug bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-slate-50/60 rounded-lg px-1.5 py-0.5 -mx-1.5 focus:outline-none placeholder:text-slate-400"
                      />
                      <textarea
                        rows={2}
                        value={step.whyGoodFit}
                        onChange={(e) =>
                          onUpdateStep(step.id, { whyGoodFit: e.target.value })
                        }
                        placeholder="Add custom description, goals, or notes..."
                        className="w-full text-xs text-slate-500 leading-relaxed bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-slate-50/60 rounded-lg px-1.5 py-0.5 -mx-1.5 focus:outline-none resize-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Deliverable Section with Product Logo */}
                  {(() => {
                    const { label: deliverableLabel, product: productMeta } =
                      getPrimaryDeliverableLabel({
                        title: step.title,
                        iconKey: step.iconKey,
                        deliverables: step.deliverables,
                      });
                    const activeProduct =
                      (step.deliverableProduct &&
                        DELIVERABLE_PRODUCTS[step.deliverableProduct]) ||
                      productMeta;
                    const extraCount = Math.max(
                      0,
                      (step.deliverables || []).length - 1
                    );

                    return (
                      <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70 p-2 rounded-xl border border-slate-200/70">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="w-6 h-6 rounded-md bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center shrink-0 p-1"
                            title={`Made with ${activeProduct.name}`}
                          >
                            <ProductLogo
                              product={activeProduct.id}
                              className="w-4 h-4"
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-xs font-semibold text-slate-900 truncate"
                              title={deliverableLabel}
                            >
                              {deliverableLabel}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {extraCount > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStepId(step.id);
                              }}
                              title={`View all ${(step.deliverables || []).length} items`}
                              className="text-[10px] font-mono font-medium text-slate-500 hover:text-blue-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer"
                            >
                              +{extraCount}
                            </button>
                          )}
                          <a
                            href={activeProduct.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition-colors cursor-pointer"
                            title={`Open ${activeProduct.name}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Card Footer: View Details Button */}
                <div className="pt-2.5 mt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStepId(step.id);
                    }}
                    className="w-full inline-flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/80 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>View details</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500">
                      {completedCount}/{totalSubtasks} tasks
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Step Details Modal (All Fields Editable + Action Checklist) */}
      {selectedStep && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={() => {
            setSelectedStepId(null);
            setEditingSubtask(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Step Details: ${selectedStep.title || "Custom Step"}`}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <ArtefactSymbol
                  iconKey={selectedStep.iconKey}
                  name={selectedStep.title}
                  className="w-4 h-4"
                  badgeClassName="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0"
                />
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded-md">
                  {selectedStepIndex + 1 < 10
                    ? `0${selectedStepIndex + 1}`
                    : `${selectedStepIndex + 1}`}
                </span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Step Details &amp; Action Checklist
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStepId(null);
                  setEditingSubtask(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Title & Core Metadata */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Step Title
                  </label>
                  <input
                    type="text"
                    value={selectedStep.title}
                    onChange={(e) =>
                      onUpdateStep(selectedStep.id, { title: e.target.value })
                    }
                    placeholder="Enter step title..."
                    className="w-full px-3 py-2 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Phase
                  </label>
                  <input
                    type="text"
                    value={selectedStep.phase}
                    onChange={(e) =>
                      onUpdateStep(selectedStep.id, { phase: e.target.value })
                    }
                    placeholder="e.g., Discover, Explore, Test"
                    className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Description / Why This Step Fits
                  </label>
                  <textarea
                    rows={2}
                    value={selectedStep.whyGoodFit}
                    onChange={(e) =>
                      onUpdateStep(selectedStep.id, {
                        whyGoodFit: e.target.value,
                      })
                    }
                    placeholder="Describe what this step covers and why it matters..."
                    className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 leading-relaxed"
                  />
                </div>
              </div>

              {/* Action Checklist Section */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Action Checklist
                  </label>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {
                      (selectedStep.subtasks || []).filter((t) => t.completed)
                        .length
                    }
                    /{(selectedStep.subtasks || []).length} completed
                  </span>
                </div>

                <div className="space-y-1.5 bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
                  {(selectedStep.subtasks || []).length === 0 && (
                    <p className="text-xs text-slate-400 py-1">
                      No checklist tasks yet. Add one below.
                    </p>
                  )}

                  {(selectedStep.subtasks || []).map((sub) => {
                    const isEditingThis =
                      editingSubtask?.stepId === selectedStep.id &&
                      editingSubtask?.subtaskId === sub.id;

                    if (isEditingThis) {
                      return (
                        <div
                          key={sub.id}
                          className="flex items-center gap-1.5 py-0.5"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingSubtask.value}
                            onChange={(e) =>
                              setEditingSubtask({
                                ...editingSubtask,
                                value: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleCommitSubtaskEdit();
                              } else if (e.key === "Escape") {
                                setEditingSubtask(null);
                              }
                            }}
                            onBlur={handleCommitSubtaskEdit}
                            className="flex-1 px-2.5 py-1 text-xs bg-white border border-blue-500 rounded-lg focus:outline-none text-slate-900"
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleCommitSubtaskEdit();
                            }}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={sub.id}
                        className="group flex items-start justify-between gap-2 py-1 px-2 rounded-lg hover:bg-white transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onToggleSubtask(selectedStep.id, sub.id)
                          }
                          className="mt-0.5 text-left shrink-0 cursor-pointer"
                          title={
                            sub.completed ? "Mark incomplete" : "Mark complete"
                          }
                        >
                          {sub.completed ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                          )}
                        </button>

                        <span
                          onClick={() =>
                            setEditingSubtask({
                              stepId: selectedStep.id,
                              subtaskId: sub.id,
                              value: sub.label,
                            })
                          }
                          title="Click to edit item"
                          className={`flex-1 text-xs leading-snug cursor-text ${
                            sub.completed
                              ? "line-through text-slate-400"
                              : "text-slate-700 hover:text-slate-900"
                          }`}
                        >
                          {sub.label}
                        </span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingSubtask({
                                stepId: selectedStep.id,
                                subtaskId: sub.id,
                                value: sub.label,
                              })
                            }
                            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            title="Edit checklist item"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveSubtask(selectedStep.id, sub.id)
                            }
                            className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                            title="Remove checklist item"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add New Checklist Item Input */}
                  <div className="pt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={newSubtaskInput}
                      onChange={(e) => setNewSubtaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddSubtaskSubmit(selectedStep.id);
                        }
                      }}
                      placeholder="+ Add checklist item..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-slate-800 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSubtaskSubmit(selectedStep.id)}
                      disabled={!newSubtaskInput.trim()}
                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 disabled:opacity-40 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Deliverables Section */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Deliverables &amp; Product Tools
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Figma · Google Docs · FigJam · AI Studio
                  </span>
                </div>

                <div className="space-y-2.5">
                  {(selectedStep.deliverables || []).map((deliv, dIdx) => {
                    const delivProduct =
                      dIdx === 0 && selectedStep.deliverableProduct
                        ? DELIVERABLE_PRODUCTS[selectedStep.deliverableProduct]
                        : resolveDeliverableProduct({
                            title: selectedStep.title,
                            iconKey: selectedStep.iconKey,
                            deliverable: deliv,
                          });

                    return (
                      <div
                        key={dIdx}
                        className="flex items-center gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-200"
                      >
                        <span
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center shrink-0 p-1"
                          title={`Made with ${delivProduct.name}`}
                        >
                          <ProductLogo
                            product={delivProduct.id}
                            className="w-4 h-4"
                          />
                        </span>

                        <select
                          value={
                            dIdx === 0 && selectedStep.deliverableProduct
                              ? selectedStep.deliverableProduct
                              : delivProduct.id
                          }
                          onChange={(e) => {
                            const val = e.target.value as DeliverableProduct;
                            if (dIdx === 0) {
                              onUpdateStep(selectedStep.id, {
                                deliverableProduct: val,
                              });
                            }
                          }}
                          aria-label={`Tool for deliverable ${dIdx + 1}`}
                          className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-600 shrink-0 cursor-pointer"
                        >
                          <option value="figma">Figma (Hi-Fi Design)</option>
                          <option value="google-docs">Google Docs (Doc / Text)</option>
                          <option value="figjam">FigJam (Visual Canvas)</option>
                          <option value="ai-studio">AI Studio (AI Prototype)</option>
                        </select>

                        <input
                          type="text"
                          value={deliv}
                          onChange={(e) => {
                            const next = [...(selectedStep.deliverables || [])];
                            next[dIdx] = e.target.value;
                            onUpdateStep(selectedStep.id, { deliverables: next });
                          }}
                          className="flex-1 px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                        />

                        <a
                          href={delivProduct.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors shrink-0 cursor-pointer"
                          title={`Open ${delivProduct.name}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            const next = (selectedStep.deliverables || []).filter(
                              (_, i) => i !== dIdx
                            );
                            onUpdateStep(selectedStep.id, { deliverables: next });
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove deliverable"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newDeliverableInput}
                      onChange={(e) => setNewDeliverableInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = newDeliverableInput.trim();
                          if (!val) return;
                          onUpdateStep(selectedStep.id, {
                            deliverables: [
                              ...(selectedStep.deliverables || []),
                              val,
                            ],
                          });
                          setNewDeliverableInput("");
                        }
                      }}
                      placeholder="+ Add deliverable (e.g. Figma file, Google Doc Brief, FigJam Flow)..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600 text-slate-800 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      disabled={!newDeliverableInput.trim()}
                      onClick={() => {
                        const val = newDeliverableInput.trim();
                        if (!val) return;
                        onUpdateStep(selectedStep.id, {
                          deliverables: [
                            ...(selectedStep.deliverables || []),
                            val,
                          ],
                        });
                        setNewDeliverableInput("");
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 disabled:opacity-40 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const idToRemove = selectedStep.id;
                  setSelectedStepId(null);
                  onRemoveStep(idToRemove);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Step</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedStepId(null);
                  setEditingSubtask(null);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-xl transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
