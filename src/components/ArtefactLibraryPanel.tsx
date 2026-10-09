/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  FileText,
  Files,
  Folder,
  MessageSquareQuote,
  FlaskConical,
  UserCheck,
  GitFork,
  Compass,
  StickyNote,
  Layout,
  ListChecks,
  GripVertical,
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
  Trash2,
} from "lucide-react";
import {
  ARTEFACT_LIBRARY_ITEMS,
  ArtefactLibraryItem,
  ArtefactType,
} from "../types/artefacts";

interface ArtefactLibraryPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onAddArtefact: (type: ArtefactType) => void;
  onClearCanvas: () => void;
  hasNodes: boolean;
}

export const ArtefactLibraryPanel: React.FC<ArtefactLibraryPanelProps> = ({
  isOpen,
  onToggleOpen,
  onAddArtefact,
  onClearCanvas,
  hasNodes,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const getItemIcon = (type: ArtefactType) => {
    switch (type) {
      case "context":
        return <FileText className="w-4 h-4 text-slate-700" />;
      case "document":
        return <Files className="w-4 h-4 text-slate-700" />;
      case "drive-folder":
        return <Folder className="w-4 h-4 text-slate-700" />;
      case "interview-script":
        return <MessageSquareQuote className="w-4 h-4 text-slate-700" />;
      case "usability-script":
        return <FlaskConical className="w-4 h-4 text-slate-700" />;
      case "user-persona":
        return <UserCheck className="w-4 h-4 text-slate-700" />;
      case "user-flow":
        return <GitFork className="w-4 h-4 text-slate-700" />;
      case "user-journey-map":
        return <Compass className="w-4 h-4 text-slate-700" />;
      case "affinity-map":
        return <StickyNote className="w-4 h-4 text-slate-700" />;
      case "wireframe":
        return <Layout className="w-4 h-4 text-slate-700" />;
      case "survey-questions":
        return <ListChecks className="w-4 h-4 text-slate-700" />;
      default:
        return <Layers className="w-4 h-4 text-slate-700" />;
    }
  };

  const categories = ["All", "Input", "Output"];

  const filteredItems = ARTEFACT_LIBRARY_ITEMS.filter((item) => {
    const matchesQuery =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.badge.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "All" || item.category === selectedCategory;

    return matchesQuery && matchesCategory;
  });

  const handleDragStart = (e: React.DragEvent, item: ArtefactLibraryItem) => {
    e.dataTransfer.setData("application/kickstart-artefact-type", item.type);
    e.dataTransfer.effectAllowed = "copy";
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggleOpen}
        className="fixed left-3 top-16 z-30 flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 text-slate-700 text-xs font-medium transition-all"
        title="Open Artefact Library"
      >
        <Layers className="w-3.5 h-3.5 text-slate-600" />
        <span>Artefact Library</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
      </button>
    );
  }

  return (
    <aside className="fixed left-3 top-16 bottom-3 z-30 w-76 bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col overflow-hidden transition-all">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-600" />
          <div>
            <h2 className="text-xs font-bold text-slate-900 tracking-tight">
              Artefact Library
            </h2>
            <p className="text-[10px] text-slate-400">
              Drag artefacts to canvas
            </p>
          </div>
        </div>
        <button
          onClick={onToggleOpen}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          title="Collapse Library"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search & Filter */}
      <div className="p-3 border-b border-slate-100 space-y-2 bg-white">
        <div className="relative">
          <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search artefacts..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-[10px]">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Artefacts List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {(selectedCategory === "All"
          ? (["Input", "Output"] as const).map((cat) => ({
              title: `${cat}s`,
              items: filteredItems.filter((item) => item.category === cat),
            }))
          : [{ title: null, items: filteredItems }]
        )
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.title ?? "items"} className="space-y-2">
              {group.title && (
                <h4 className="px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </h4>
              )}
              {group.items.map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  onClick={() => onAddArtefact(item.type)}
                  className="group relative bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-2.5 shadow-2xs hover:shadow-xs transition-all cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        {getItemIcon(item.type)}
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900 group-hover:text-slate-950 transition-colors">
                        {item.name}
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {item.badge}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {filteredItems.length === 0 && (
          <div className="py-8 text-center text-slate-400 text-xs">
            No artefacts match &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>

      {/* Footer */}
      {hasNodes && (
        <div className="p-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClearCanvas}
            className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors"
            title="Clear canvas"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear canvas</span>
          </button>
        </div>
      )}
    </aside>
  );
};
