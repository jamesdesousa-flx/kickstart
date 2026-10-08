import React from "react";
import {
  Briefcase,
  Mic,
  ClipboardList,
  Trophy,
  ShieldCheck,
  ScanSearch,
  BarChart3,
  Compass,
  StickyNote,
  UserCircle,
  Target,
  Heart,
  Route,
  Layers,
  AlertCircle,
  HelpCircle,
  Gem,
  GitFork,
  LayoutGrid,
  Users,
  Palette,
  Network,
  FolderKanban,
  ListTree,
  Workflow,
  PenTool,
  Frame,
  LayoutTemplate,
  Cpu,
  Paintbrush,
  Accessibility,
  UserCheck,
  Split,
  SlidersHorizontal,
  MousePointerClick,
  Timer,
  ThumbsUp,
  Flame,
  Video,
  FilePlus2,
  LucideIcon,
} from "lucide-react";
import { NNG_METHOD_CATALOG } from "../data/uxrMethodsData";

const ARTEFACT_ICON_MAP: Record<string, LucideIcon> = {
  "stakeholder-interview": Briefcase,
  "user-interview": Mic,
  "survey-results": ClipboardList,
  "competitive-analysis": Trophy,
  "heuristic-evaluation": ShieldCheck,
  "ux-audit": ScanSearch,
  "analytics-review": BarChart3,
  "field-study": Compass,
  "affinity-diagrams": StickyNote,
  "personas": UserCircle,
  "jtbd": Target,
  "empathy-map": Heart,
  "customer-journey-map": Route,
  "service-blueprint": Layers,
  "problem-statement": AlertCircle,
  "hmw-questions": HelpCircle,
  "value-prop-canvas": Gem,
  "opportunity-solution-tree": GitFork,
  "crazy-8s": LayoutGrid,
  "workshopping": Users,
  "mood-boards": Palette,
  "site-map": Network,
  "card-sorting": FolderKanban,
  "tree-testing": ListTree,
  "user-flows": Workflow,
  "low-fi-wireframes": PenTool,
  "mid-fi-wireframes": Frame,
  "high-fi-wireframes": LayoutTemplate,
  "ai-prototype": Cpu,
  "high-fi-designs": Paintbrush,
  "accessibility-audit": Accessibility,
  "usability-test": UserCheck,
  "ab-test": Split,
  "multivariate-test": SlidersHorizontal,
  "first-click-test": MousePointerClick,
  "five-second-test": Timer,
  "preference-test": ThumbsUp,
  "heatmaps": Flame,
  "session-recordings": Video,
};

export function resolveArtefactIconKey(
  iconKey?: string,
  nameOrTitle?: string
): string | undefined {
  if (iconKey && ARTEFACT_ICON_MAP[iconKey]) {
    return iconKey;
  }
  if (!nameOrTitle) return undefined;
  const lower = nameOrTitle.trim().toLowerCase();

  // Exact or substring match against the 39 artefacts catalog
  const exact = NNG_METHOD_CATALOG.find(
    (item) => item.name.toLowerCase() === lower
  );
  if (exact) return exact.iconKey;

  const partial = NNG_METHOD_CATALOG.find(
    (item) =>
      lower.includes(item.name.toLowerCase()) ||
      item.name.toLowerCase().includes(lower)
  );
  if (partial) return partial.iconKey;

  // Keyword heuristics for AI-generated step titles
  if (lower.includes("stakeholder")) return "stakeholder-interview";
  if (lower.includes("interview")) return "user-interview";
  if (lower.includes("survey") || lower.includes("questionnaire"))
    return "survey-results";
  if (lower.includes("competit")) return "competitive-analysis";
  if (lower.includes("heuristic")) return "heuristic-evaluation";
  if (lower.includes("accessibility") || lower.includes("a11y") || lower.includes("wcag"))
    return "accessibility-audit";
  if (lower.includes("audit")) return "ux-audit";
  if (lower.includes("analytic") || lower.includes("funnel"))
    return "analytics-review";
  if (lower.includes("field") || lower.includes("contextual"))
    return "field-study";
  if (lower.includes("affinity")) return "affinity-diagrams";
  if (lower.includes("persona")) return "personas";
  if (lower.includes("jobs-to-be-done") || lower.includes("jtbd"))
    return "jtbd";
  if (lower.includes("empathy")) return "empathy-map";
  if (lower.includes("journey")) return "customer-journey-map";
  if (lower.includes("blueprint")) return "service-blueprint";
  if (lower.includes("problem statement")) return "problem-statement";
  if (lower.includes("how might we") || lower.includes("hmw"))
    return "hmw-questions";
  if (lower.includes("value prop")) return "value-prop-canvas";
  if (lower.includes("opportunity solution") || lower.includes("solution tree"))
    return "opportunity-solution-tree";
  if (lower.includes("crazy 8")) return "crazy-8s";
  if (lower.includes("workshop")) return "workshopping";
  if (lower.includes("mood board") || lower.includes("moodboard"))
    return "mood-boards";
  if (lower.includes("site map") || lower.includes("sitemap"))
    return "site-map";
  if (lower.includes("card sort")) return "card-sorting";
  if (lower.includes("tree test")) return "tree-testing";
  if (lower.includes("flow")) return "user-flows";
  if (lower.includes("low-fi") || lower.includes("low-fidelity") || lower.includes("lo-fi"))
    return "low-fi-wireframes";
  if (lower.includes("mid-fi") || lower.includes("mid-fidelity"))
    return "mid-fi-wireframes";
  if (lower.includes("high-fidelity wireframe") || lower.includes("high-fi wireframe"))
    return "high-fi-wireframes";
  if (lower.includes("wireframe")) return "low-fi-wireframes";
  if (lower.includes("prototype")) return "ai-prototype";
  if (lower.includes("high-fi") || lower.includes("high-fidelity") || lower.includes("design"))
    return "high-fi-designs";
  if (lower.includes("usability")) return "usability-test";
  if (lower.includes("a/b")) return "ab-test";
  if (lower.includes("multivariate")) return "multivariate-test";
  if (lower.includes("first-click") || lower.includes("first click"))
    return "first-click-test";
  if (lower.includes("five-second") || lower.includes("5-second"))
    return "five-second-test";
  if (lower.includes("preference")) return "preference-test";
  if (lower.includes("heatmap")) return "heatmaps";
  if (lower.includes("session") || lower.includes("recording"))
    return "session-recordings";

  return undefined;
}

interface ArtefactSymbolProps {
  iconKey?: string;
  name?: string;
  className?: string;
  badgeClassName?: string;
}

export const ArtefactSymbol: React.FC<ArtefactSymbolProps> = ({
  iconKey,
  name,
  className = "w-3.5 h-3.5",
  badgeClassName = "w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center shrink-0",
}) => {
  const resolvedKey = resolveArtefactIconKey(iconKey, name);
  const IconComponent =
    (resolvedKey && ARTEFACT_ICON_MAP[resolvedKey]) || FilePlus2;

  return (
    <span className={badgeClassName} aria-hidden="true">
      <IconComponent className={className} />
    </span>
  );
};
