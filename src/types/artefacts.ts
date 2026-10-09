/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ArtefactType =
  | "context"
  | "document"
  | "drive-folder"
  | "interview-script"
  | "usability-script"
  | "user-persona"
  | "user-flow"
  | "user-journey-map"
  | "affinity-map"
  | "research-report"
  | "wireframe"
  | "survey-questions"
  | "sticky-note";

/** Canvas-only annotation types: no ports, never wired into generation */
export function isAnnotationNode(type: ArtefactType): boolean {
  return type === "sticky-note";
}

export type StickyNoteColor = "yellow" | "pink" | "blue" | "green" | "purple";

export interface DriveFolderFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textContent?: string;
  base64Data?: string;
  excerpt?: string;
}

/* ==========================================================================
   Interview Script
   ========================================================================== */
export interface InterviewQuestionItem {
  question: string;
  probes: string[];
  expectedInsights: string;
}

export interface InterviewSection {
  theme: string;
  purpose: string;
  questions: InterviewQuestionItem[];
}

export interface InterviewScriptData {
  title: string;
  overview: string;
  targetAudience: string;
  screenerCriteria: string[];
  introScript: string;
  sections: InterviewSection[];
  wrapUpScript: string;
  analysisTips: string[];
}

/* ==========================================================================
   Usability Testing Script
   ========================================================================== */
export interface UsabilityTaskScenario {
  scenarioNumber: number;
  title: string;
  context: string;
  taskPrompt: string;
  successCriteria: string;
  observerNotes: string;
}

export interface UsabilityScriptData {
  title: string;
  testObjectives: string;
  methodology: string;
  setupAndMaterials: string[];
  moderatorBriefing: string;
  scenarios: UsabilityTaskScenario[];
  postTaskMetrics: {
    seqQuestion: string;
    susScaleQuestions: string[];
  };
  debriefQuestions: string[];
}

/* ==========================================================================
   User Persona
   ========================================================================== */
export interface UserPersonaData {
  name: string;
  role: string;
  tagline: string;
  avatarInitials: string;
  avatarColor: string;
  demographics: {
    ageRange: string;
    experienceLevel: string;
    locationOrContext: string;
    techComfort: string;
  };
  bio: string;
  coreQuote: string;
  goals: string[];
  frustrations: string[];
  behaviors: string[];
  toolsAndEnvironment: string[];
}

/* ==========================================================================
   User Flow
   ========================================================================== */
export interface UserFlowNode {
  id: string;
  stepNumber: number;
  label: string;
  type: "start" | "action" | "decision" | "screen" | "end";
  description: string;
  systemResponse: string;
  edgeCaseNote?: string;
}

export interface UserFlowConnection {
  from: string;
  to: string;
  conditionLabel?: string;
}

export interface UserFlowData {
  title: string;
  userGoal: string;
  startTrigger: string;
  endOutcome: string;
  nodes: UserFlowNode[];
  connections: UserFlowConnection[];
  keyDesignConsiderations: string[];
}

/* ==========================================================================
   User Journey Map
   ========================================================================== */
export interface JourneyPhase {
  phaseName: string;
  userActions: string[];
  userThoughts: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // 1 to 5
  touchpoints: string[];
  painPoints: string[];
  opportunities: string[];
}

export interface UserJourneyMapData {
  title: string;
  personaName: string;
  scenario: string;
  phases: JourneyPhase[];
  strategicTakeaways: string[];
}

/* ==========================================================================
   Affinity Map
   Notes are grouped bottom-up: note -> cluster -> theme
   ========================================================================== */
export type AffinityNoteKind = "insight" | "pain-point" | "finding" | "quote";

export interface AffinityNote {
  /** One observation per note, short enough to read on a sticky */
  text: string;
  kind: AffinityNoteKind;
  /** Who or what the note came from, e.g. "P3" or "Survey" */
  source: string;
}

export interface AffinityCluster {
  label: string;
  notes: AffinityNote[];
}

export interface AffinityTheme {
  name: string;
  /** What the theme means, written as a finding rather than a topic */
  insight: string;
  clusters: AffinityCluster[];
}

export interface AffinityMapData {
  title: string;
  researchQuestion: string;
  sources: string[];
  themes: AffinityTheme[];
  /** Notes that fit no theme yet; kept so weak signals are not lost */
  outliers: AffinityNote[];
  keyTakeaways: string[];
}

/* ==========================================================================
   Research Report
   A UX findings doc: conclusions first, then evidence, then detail
   ========================================================================== */
export type ResearchFindingSeverity = "critical" | "high" | "medium" | "low";

export type ResearchRecommendationPriority = "now" | "next" | "later";

export interface ResearchEvidence {
  /** Verbatim words from a source */
  quote: string;
  /** Participant ID or document name, e.g. "P3" */
  source: string;
}

export interface ResearchFinding {
  /** Stable reference such as "F1", used by recommendations */
  id: string;
  /** The finding as a full sentence, not a topic label */
  headline: string;
  /** What was observed and why it matters */
  detail: string;
  severity: ResearchFindingSeverity;
  /** How many sources support it, as a count, e.g. "4 of 6 participants" */
  frequency: string;
  evidence: ResearchEvidence[];
}

export interface ResearchTheme {
  name: string;
  /** What the theme means, written as a finding rather than a topic */
  insight: string;
  findings: ResearchFinding[];
}

export interface ResearchRecommendation {
  action: string;
  rationale: string;
  priority: ResearchRecommendationPriority;
  /** Finding IDs this recommendation addresses */
  relatedFindings: string[];
}

export interface ResearchReportData {
  title: string;
  /** 2 to 4 sentences: what we learned and what to do about it */
  executiveSummary: string;
  keyTakeaways: string[];
  /** Why the research was done and which decision it informs */
  background: string;
  researchQuestions: string[];
  methodology: {
    methods: string;
    participants: string;
    timeframe: string;
  };
  themes: ResearchTheme[];
  /** Positive findings to keep when the product changes */
  whatWorked: string[];
  recommendations: ResearchRecommendation[];
  limitations: string[];
  nextSteps: string[];
  participants: Array<{ id: string; profile: string }>;
}

/* ==========================================================================
   Wireframe
   ========================================================================== */
export interface WireframeSectionItem {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: string;
  value?: string;
}

export interface WireframeSection {
  sectionTitle: string;
  /** A block from SECTION_TYPES in server/wireframeLayout.ts (cards, feed, chat, calendar, ...) */
  contentType: string;
  items: WireframeSectionItem[];
  width?: "full" | "half";
  pane?: "primary" | "secondary" | "overlay";
  columns?: string[];
}

export interface WireframeInteractiveState {
  stateName: string;
  description: string;
  keyDifferences: string[];
}

export interface WireframeData {
  title: string;
  screenType: "mobile" | "web-desktop" | "tablet";
  screenTitle: string;
  screenPurpose: string;
  layoutStructure: {
    header: { title: string; actions: string[] };
    /** Option names come from the catalogs in server/wireframeLayout.ts */
    screenLayout?: string;
    headerStyle?: string;
    sidebarOrNav?: string[];
    navStyle?: string;
    heroStyle?: string;
    overlay?: string;
    floatingAction?: string;
    heroOrSummary?: {
      title: string;
      subtitle: string;
      actions?: string[];
      stats?: Array<{ label: string; value: string }>;
    };
    mainSections: WireframeSection[];
    footerOrBottomBar?: { actions: string[] };
  };
  interactiveStates: WireframeInteractiveState[];
  uiComponentsUsed: string[];
  designNotes: string[];
}

/* ==========================================================================
   Survey Questions
   ========================================================================== */
export interface SurveyQuestionItem {
  id: string;
  number: number;
  question: string;
  type: "single-choice" | "multiple-choice" | "likert-scale" | "open-text" | "nps";
  options?: string[];
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  required: boolean;
  logicRule?: string;
  purposeRationale: string;
}

export interface SurveyQuestionsData {
  title: string;
  objective: string;
  targetRespondent: string;
  estimatedMinutes: number;
  introNote: string;
  questions: SurveyQuestionItem[];
  closingNote: string;
}

/* ==========================================================================
   Canvas Node & Edge Types
   ========================================================================== */
export type GeneratedArtefactPayload =
  | { type: "interview-script"; data: InterviewScriptData }
  | { type: "usability-script"; data: UsabilityScriptData }
  | { type: "user-persona"; data: UserPersonaData }
  | { type: "user-flow"; data: UserFlowData }
  | { type: "user-journey-map"; data: UserJourneyMapData }
  | { type: "affinity-map"; data: AffinityMapData }
  | { type: "research-report"; data: ResearchReportData }
  | { type: "wireframe"; data: WireframeData }
  | { type: "survey-questions"; data: SurveyQuestionsData };

export interface CanvasNode {
  id: string;
  type: ArtefactType;
  title: string;
  position: { x: number; y: number };
  
  // Context-specific fields
  contextText?: string;
  documents?: UploadedDocument[];

  // Sticky note fields
  noteText?: string;
  noteColor?: StickyNoteColor;

  // Google Drive fields (a folder or a single file such as a Google Doc)
  driveItemKind?: "folder" | "file";
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderUrl?: string;
  driveFolderFiles?: DriveFolderFileItem[];
  driveLastSyncedAt?: string;

  // Generative fields
  customGuidance?: string;
  isGenerating?: boolean;
  generatedAt?: string;
  generatedData?: GeneratedArtefactPayload;
  error?: string | null;

  // Google Docs fields
  googleDocId?: string;
  googleDocUrl?: string;
  googleDocCreatedAt?: string;

  // FigJam MCP fields
  figjamFileId?: string;
  figjamFileUrl?: string;
  figjamEmbedUrl?: string;
  figjamCreatedAt?: string;
  figjamBoardData?: any;
}

/**
 * Returns whether an artefact type is visual and rendered/exported via FigJam MCP
 */
export function isVisualFigjamArtefact(type: ArtefactType): boolean {
  return (
    type === "wireframe" ||
    type === "user-journey-map" ||
    type === "user-flow" ||
    type === "affinity-map"
  );
}

export interface FigjamMcpToolCallLog {
  id: string;
  timestamp: string;
  toolName: string;
  params: any;
  result?: any;
  durationMs: number;
  status: "success" | "error";
  error?: string;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
}

export interface ArtefactLibraryItem {
  type: ArtefactType;
  name: string;
  badge: string;
  category: "Input" | "Output";
  description: string;
  color: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  defaultTitle: string;
}

export const ARTEFACT_LIBRARY_ITEMS: ArtefactLibraryItem[] = [
  {
    type: "context",
    name: "Context",
    badge: "Input",
    category: "Input",
    description: "Write problem background, project goals, hypotheses, and scope requirements to feed your assets.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Project Context",
  },
  {
    type: "document",
    name: "Document",
    badge: "Input",
    category: "Input",
    description: "Upload PDFs, markdown notes, research briefs, transcripts, and PRDs to inform downstream assets.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Research Document",
  },
  {
    type: "drive-folder",
    name: "Google Drive",
    badge: "Input",
    category: "Input",
    description: "Connect a Google Drive folder or Google Doc by URL, or browse your Drive, to import briefs, notes, and research into canvas.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Google Drive",
  },
  {
    type: "interview-script",
    name: "Interview Script",
    badge: "Discovery",
    category: "Output",
    description: "Generate structured interview guide with warm-up, core themes, and probing questions.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "User Interview Script",
  },
  {
    type: "usability-script",
    name: "Usability Testing Script",
    badge: "Validation",
    category: "Output",
    description: "Generate test protocol, task scenarios, success benchmarks, SEQ and SUS metrics.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Usability Test Protocol",
  },
  {
    type: "user-persona",
    name: "User Persona",
    badge: "Definition",
    category: "Output",
    description: "Generate vivid user profile with goals, pain points, core quote, and tech behaviors.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Primary User Persona",
  },
  {
    type: "user-flow",
    name: "User Flow",
    badge: "Architecture",
    category: "Output",
    description: "Generate step-by-step flowchart with decision diamonds, actions, and system responses.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Core Task User Flow",
  },
  {
    type: "user-journey-map",
    name: "User Journey Map",
    badge: "Experience",
    category: "Output",
    description: "Generate longitudinal timeline across phases with actions, thoughts, and sentiment curve.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Customer Journey Map",
  },
  {
    type: "affinity-map",
    name: "Affinity Map",
    badge: "Synthesis",
    category: "Output",
    description: "Turn research notes into insight, pain point, finding and quote stickies grouped into themes.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Research Affinity Map",
  },
  {
    type: "research-report",
    name: "Research Report",
    badge: "Synthesis",
    category: "Output",
    description: "Summarise research into a UX findings doc with prioritised findings, evidence and recommendations.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "UX Research Report",
  },
  {
    type: "wireframe",
    name: "Wireframe",
    badge: "Design",
    category: "Output",
    description: "Generate visual low-fidelity screen layouts, interactive UI states, and component hierarchy.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "Key Screen Wireframe",
  },
  {
    type: "survey-questions",
    name: "Survey Questions",
    badge: "Validation",
    category: "Output",
    description: "Generate structured questionnaire with screeners, Likert scales, NPS, and branching logic.",
    color: "slate",
    accentBg: "bg-slate-100",
    accentBorder: "border-slate-200",
    accentText: "text-slate-700",
    defaultTitle: "User Research Survey",
  },
];
