/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CopyPlus, Trash2 } from "lucide-react";
import { CanvasNode, StickyNoteColor } from "../types/artefacts";

const STICKY_NOTE_COLORS: Record<
  StickyNoteColor,
  { label: string; body: string; header: string; swatch: string }
> = {
  yellow: { label: "Yellow", body: "bg-amber-100 border-amber-200", header: "bg-amber-200/60", swatch: "bg-amber-300" },
  pink: { label: "Pink", body: "bg-pink-100 border-pink-200", header: "bg-pink-200/60", swatch: "bg-pink-300" },
  blue: { label: "Blue", body: "bg-sky-100 border-sky-200", header: "bg-sky-200/60", swatch: "bg-sky-300" },
  green: { label: "Green", body: "bg-emerald-100 border-emerald-200", header: "bg-emerald-200/60", swatch: "bg-emerald-300" },
  purple: { label: "Purple", body: "bg-violet-100 border-violet-200", header: "bg-violet-200/60", swatch: "bg-violet-300" },
};

interface StickyNoteCardProps {
  node: CanvasNode;
  onUpdateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  onRemoveNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDragStart: (e: React.MouseEvent) => void;
}

/**
 * Free-form note for the user's own comments. Has no connector ports, so it
 * can never be wired into (or feed) artefact generation.
 */
export const StickyNoteCard: React.FC<StickyNoteCardProps> = ({
  node,
  onUpdateNode,
  onRemoveNode,
  onDuplicateNode,
  onDragStart,
}) => {
  const color = STICKY_NOTE_COLORS[node.noteColor || "yellow"];

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className={`group relative rounded-md border shadow-md ${color.body}`}
    >
      {/* Drag handle with hover actions */}
      <div
        onMouseDown={onDragStart}
        className={`h-7 px-1.5 rounded-t-md flex items-center justify-between cursor-grab active:cursor-grabbing ${color.header}`}
      >
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {(Object.keys(STICKY_NOTE_COLORS) as StickyNoteColor[]).map((key) => (
            <button
              key={key}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onUpdateNode(node.id, { noteColor: key })}
              title={STICKY_NOTE_COLORS[key].label}
              aria-label={`${STICKY_NOTE_COLORS[key].label} note`}
              className={`w-3 h-3 rounded-full border cursor-pointer ${STICKY_NOTE_COLORS[key].swatch} ${
                (node.noteColor || "yellow") === key ? "border-slate-700" : "border-white/80"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onDuplicateNode(node.id)}
            className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
            title="Duplicate note"
          >
            <CopyPlus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onRemoveNode(node.id)}
            className="p-1 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
            title="Delete note"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <textarea
        autoFocus={!node.noteText}
        value={node.noteText || ""}
        onChange={(e) => onUpdateNode(node.id, { noteText: e.target.value })}
        placeholder="Add a note..."
        className="block w-full min-h-[160px] p-3 bg-transparent text-sm text-slate-800 placeholder-slate-500/70 leading-relaxed resize-y focus:outline-none"
      />
    </div>
  );
};
