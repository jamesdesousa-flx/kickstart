import React, { useState } from "react";
import { Plus, ExternalLink, Check, Search, GripVertical } from "lucide-react";
import { NNGMethodCatalogItem } from "../data/uxrMethodsData";
import { ArtefactSymbol } from "./ArtefactSymbol";
import { ProductLogo, getPrimaryDeliverableLabel } from "./ProductLogo";

interface NngMethodLandscapeProps {
  catalog: NNGMethodCatalogItem[];
  onAddMethodToRoadmap: (method: NNGMethodCatalogItem) => void;
  compact?: boolean;
}

const PHASES = [
  "All",
  "Discover",
  "Explore",
  "Test",
  "Listen",
  "Synthesize & Deliver",
] as const;

export const NngMethodLandscape: React.FC<NngMethodLandscapeProps> = ({
  catalog,
  onAddMethodToRoadmap,
  compact = false,
}) => {
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhase, setSelectedPhase] = useState<string>("All");

  const handleAdd = (item: NNGMethodCatalogItem) => {
    onAddMethodToRoadmap(item);
    setAddedIds((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [item.id]: false }));
    }, 1400);
  };

  const filteredCatalog = catalog.filter((item) => {
    const matchesPhase =
      selectedPhase === "All" || item.phase === selectedPhase;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.whenToUse.toLowerCase().includes(q) ||
      item.phase.toLowerCase().includes(q);
    return matchesPhase && matchesQuery;
  });

  return (
    <section
      id="artefact-landscape-section"
      aria-label="Artefact Library"
      className="space-y-3.5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            Artefact Library
          </h2>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {filteredCatalog.length}
          </span>
        </div>
      </div>

      {/* Search & Phase Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter artefacts..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600 text-slate-900"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PHASES.map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setSelectedPhase(phase)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedPhase === phase
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              {phase === "Synthesize & Deliver" ? "Deliver" : phase}
            </button>
          ))}
        </div>
      </div>

      {/* Artefact Cards List / Grid */}
      <div
        className={
          compact
            ? "space-y-2.5"
            : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        }
      >
        {filteredCatalog.map((item) => {
          const isJustAdded = Boolean(addedIds[item.id]);

          return (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/x-methodmap-catalog-item",
                  JSON.stringify(item)
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="bg-white border border-slate-200/90 rounded-xl p-3.5 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors cursor-grab active:cursor-grabbing"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1 min-w-0">
                    <GripVertical className="w-3 h-3 text-slate-300 shrink-0" />
                    <span className="font-semibold text-blue-600 truncate">
                      {item.phase}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{item.qualVsQuant}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ArtefactSymbol
                    iconKey={item.iconKey}
                    name={item.name}
                    className="w-3.5 h-3.5"
                    badgeClassName="w-7 h-7 rounded-lg bg-blue-50/80 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-xs font-semibold text-slate-900 leading-snug">
                      {item.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                      {item.whenToUse}
                    </p>
                  </div>
                </div>

                {/* Deliverable badge with product logo */}
                {(() => {
                  const { label, product } = getPrimaryDeliverableLabel({
                    title: item.name,
                    iconKey: item.iconKey,
                    deliverables: item.deliverables,
                  });
                  return (
                    <div className="flex items-center gap-2 p-1.5 bg-slate-50/90 border border-slate-200/80 rounded-lg">
                      <span
                        className="w-5 h-5 rounded bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center shrink-0 p-0.5"
                        title={`Made with ${product.name}`}
                      >
                        <ProductLogo product={product.id} className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 text-[11px] truncate block" title={label}>
                          {label}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-2.5 mt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleAdd(item)}
                  className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    isJustAdded
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-900 text-white hover:bg-blue-600"
                  }`}
                >
                  {isJustAdded ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Added</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Strategy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filteredCatalog.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            No artefacts match your filter.
          </p>
        )}
      </div>
    </section>
  );
};
