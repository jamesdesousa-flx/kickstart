/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { MousePointer2, StickyNote, LucideIcon } from "lucide-react";

/**
 * Canvas tools. "select" is the default (pan, drag, wire).
 * Placement tools (e.g. "sticky-note") arm the canvas so the next click on
 * empty space places an item, then the toolbar falls back to "select".
 * To add a tool: extend this union and append an entry to CANVAS_TOOLS.
 */
export type CanvasTool = "select" | "sticky-note";

interface CanvasToolDefinition {
  id: CanvasTool;
  label: string;
  icon: LucideIcon;
  shortcut: string;
}

export const CANVAS_TOOLS: CanvasToolDefinition[] = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "sticky-note", label: "Sticky note", icon: StickyNote, shortcut: "S" },
];

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onSelectTool: (tool: CanvasTool) => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  activeTool,
  onSelectTool,
}) => {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Canvas tools"
      className="absolute left-1/2 bottom-4 -translate-x-1/2 z-20 flex items-center gap-1 bg-white/95 border border-slate-200 p-1 rounded-xl shadow-md"
    >
      {CANVAS_TOOLS.map(({ id, label, icon: Icon, shortcut }) => {
        const isActive = activeTool === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectTool(isActive && id !== "select" ? "select" : id)}
            aria-pressed={isActive}
            title={`${label} (${shortcut})`}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
};
