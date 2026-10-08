import express from "express";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { generateArtefact } from "./server/artefactGenerator.ts";
import {
  handleFigjamMcpRequest,
  FIGJAM_MCP_TOOLS,
} from "./server/figjamMcpServer.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
] as const;

const modelCooldownMap = new Map<string, number>();

function isModelCoolingDown(modelName: string): boolean {
  const expiry = modelCooldownMap.get(modelName);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelCooldownMap.delete(modelName);
    return false;
  }
  return true;
}

function markModelRateLimited(modelName: string, retryDelaySecs = 1800) {
  modelCooldownMap.set(modelName, Date.now() + retryDelaySecs * 1000);
}

function isQuotaExhaustedError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || err?.code || err?.error?.code;
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota")
  );
}

const SUPPORTED_INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientOrOverloadedError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || err?.code || err?.error?.code;
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("fetch failed") ||
    msg.includes("deadline_exceeded")
  );
}

/**
 * Extracts plain text from a .docx (ZIP archive containing word/document.xml)
 * using Node's built-in Buffer and zlib without external dependencies.
 */
function extractTextFromDocxBuffer(buf: Buffer): string {
  try {
    let offset = 0;
    const extractedChunks: string[] = [];

    while (offset + 30 <= buf.length) {
      const signature = buf.readUInt32LE(offset);
      if (signature !== 0x04034b50) {
        offset++;
        continue;
      }

      const compressionMethod = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const fileNameLength = buf.readUInt16LE(offset + 26);
      const extraFieldLength = buf.readUInt16LE(offset + 28);
      const fileNameStart = offset + 30;
      const fileNameEnd = fileNameStart + fileNameLength;

      if (fileNameEnd > buf.length) break;
      const entryName = buf.subarray(fileNameStart, fileNameEnd).toString("utf8");
      const dataStart = fileNameEnd + extraFieldLength;
      const dataEnd = dataStart + compressedSize;

      if (
        (entryName === "word/document.xml" || entryName.startsWith("word/header")) &&
        dataEnd <= buf.length &&
        compressedSize > 0
      ) {
        const rawData = buf.subarray(dataStart, dataEnd);
        let xmlBuffer: Buffer | null = null;
        if (compressionMethod === 0) {
          xmlBuffer = rawData;
        } else if (compressionMethod === 8) {
          xmlBuffer = zlib.inflateRawSync(rawData);
        }
        if (xmlBuffer) {
          const xmlText = xmlBuffer
            .toString("utf8")
            .replace(/<\/w:p>/g, "\n")
            .replace(/<w:tab\/>/g, "\t")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+\n/g, "\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
          if (xmlText) extractedChunks.push(xmlText);
        }
      }

      offset = dataEnd > offset ? dataEnd : offset + 30;
    }

    return extractedChunks.join("\n\n").trim();
  } catch {
    return "";
  }
}

async function generateJsonWithModelFallback(params: {
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  systemInstruction: string;
  responseSchema: any;
}): Promise<any> {
  for (const modelName of FALLBACK_MODELS) {
    if (isModelCoolingDown(modelName)) {
      continue;
    }

    const maxAttemptsPerModel = 2;

    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        const config: Record<string, any> = {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
          temperature: 0.35,
        };

        // Use low thinking budget on Gemini 3 models to minimize latency and avoid compute queue spikes
        if (modelName.startsWith("gemini-3")) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: params.parts },
          config,
        });

        const rawText = response.text;
        if (!rawText) {
          throw new Error(`Empty response from ${modelName}`);
        }

        return JSON.parse(rawText.trim());
      } catch (err: any) {
        if (isQuotaExhaustedError(err)) {
          // Model exceeded quota; place on cooldown so we don't attempt it again
          markModelRateLimited(modelName, 1800);
          break;
        }

        if (isTransientOrOverloadedError(err)) {
          if (attempt < maxAttemptsPerModel) {
            await sleep(650 * attempt);
            continue;
          }
          break;
        } else {
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Deterministic context-aware roadmap synthesizer used only if all upstream Gemini models
 * simultaneously return 503 UNAVAILABLE during a regional capacity spike.
 */
function synthesizeFallbackRoadmapFromInputs(input: {
  projectTitle: string;
  problemStatement: string;
  extraContext: string;
  constraints: any;
  docNames: string[];
  extractedDocText: string;
}) {
  const title = input.projectTitle?.trim() || "Product UX Research & Design Initiative";
  const combinedSource = `${input.problemStatement}\n${input.extraContext}\n${input.extractedDocText}`.trim();

  // Extract 3-4 meaningful sentences from the user's uploaded docs & problem statement
  const rawSentences = combinedSource
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[#*\-\d.)\s]+/, "").trim())
    .filter((s) => s.length > 28 && s.length < 240);

  const keyInsightsFromDocs =
    rawSentences.length >= 3
      ? rawSentences.slice(0, 4)
      : [
          input.problemStatement
            ? `Core friction identified: ${input.problemStatement.slice(0, 180)}`
            : `Synthesized primary workflow requirements from ${
                input.docNames.join(", ") || "project brief"
              }.`,
          input.extraContext
            ? `Operational context & constraints: ${input.extraContext.slice(0, 180)}`
            : `Target delivery window: ${input.constraints?.timelineWeeks || "4–6 weeks"} with ${
                input.constraints?.teamSize || "cross-functional UX & design team"
              }.`,
          `Stage focus: ${
            input.constraints?.productStage || "Iterative workflow redesign"
          } requiring behavioral validation before engineering freeze.`,
        ];

  const weeksMatch = String(input.constraints?.timelineWeeks || "5").match(/\d+/);
  const totalEstimatedWeeks = weeksMatch ? Number(weeksMatch[0]) : 5;
  const docRefLabel =
    input.docNames.length > 0
      ? `uploaded documentation (${input.docNames.join(", ")})`
      : "the project problem statement";

  return {
    roadmapTitle: `${title} Strategy`,
    executiveSummary: `A ${totalEstimatedWeeks}-week research and design strategy grounded in ${docRefLabel}.`,
    recommendedMethodologyBalance: "Behavioral Discovery + Iterative Design",
    totalEstimatedWeeks,
    keyInsightsFromDocs: keyInsightsFromDocs.map((s) =>
      s.length > 100 ? s.slice(0, 97) + "..." : s
    ),
    steps: [
      {
        id: `step-${Date.now()}-1`,
        stepNumber: 1,
        title: "User interview",
        phase: "Discover",
        track: "UX Research",
        nngDimension: "Attitudinal · Qualitative",
        whyGoodFit: `Uncover real workflow friction described in ${docRefLabel} before changing layouts.`,
        estimatedTime: "4d",
        effortHours: 16,
        sampleOrScope: "5–6 users",
        riskMitigated: "Designing for idealized happy paths.",
        deliverables: ["Friction Map", "Pain-Point Backlog"],
        subtasks: [
          {
            id: `sub-${Date.now()}-1a`,
            label: "Interview 5–6 users on core tasks",
            completed: false,
          },
          {
            id: `sub-${Date.now()}-1b`,
            label: "Cluster top blockers in Miro",
            completed: false,
          },
        ],
        tools: [
          {
            name: "Miro",
            category: "Synthesis",
            templateName: "Affinity Board",
            templateUrl: "https://miro.com/templates/affinity-diagram/",
            usageNote: "Cluster observations.",
          },
          {
            name: "Dovetail",
            category: "Repository",
            templateName: "UXR Repository",
            templateUrl: "https://dovetail.com/templates/",
            usageNote: "Tag session notes.",
          },
        ],
      },
      {
        id: `step-${Date.now()}-2`,
        stepNumber: 2,
        title: "User flows",
        phase: "Explore",
        track: "Product Design Execution",
        nngDimension: "Structural Architecture",
        whyGoodFit: "Streamline navigation paths and map error recovery states.",
        estimatedTime: "3d",
        effortHours: 14,
        sampleOrScope: "Core task flows",
        riskMitigated: "Confusing labels and dead-end states.",
        deliverables: ["User Flow Diagram", "IA Hierarchy"],
        subtasks: [
          {
            id: `sub-${Date.now()}-2a`,
            label: "Map target flow and edge cases",
            completed: false,
          },
          {
            id: `sub-${Date.now()}-2b`,
            label: "Validate field groupings with users",
            completed: false,
          },
        ],
        tools: [
          {
            name: "Figma",
            category: "Flows",
            templateName: "User Flow Kit",
            templateUrl: "https://www.figma.com/community/user-flows",
            usageNote: "Diagram core paths.",
          },
          {
            name: "Optimal Workshop",
            category: "IA",
            templateName: "Card Sort",
            templateUrl: "https://www.optimalworkshop.com/101/card-sorting/",
            usageNote: "Test taxonomy.",
          },
        ],
      },
      {
        id: `step-${Date.now()}-3`,
        stepNumber: 3,
        title: "Low-fidelity wireframes",
        phase: "Explore",
        track: "Product Design Execution",
        nngDimension: "Design Craft",
        whyGoodFit: "Explore 2–3 layout solutions rapidly before investing in visual polish.",
        estimatedTime: "4d",
        effortHours: 20,
        sampleOrScope: "8–10 key screens",
        riskMitigated: "Premature commitment to a weak layout.",
        deliverables: ["Low-Fi Wireframes", "Critique Log"],
        subtasks: [
          {
            id: `sub-${Date.now()}-3a`,
            label: "Draft 2 layout options for bottleneck screens",
            completed: false,
          },
          {
            id: `sub-${Date.now()}-3b`,
            label: "Review feasibility with engineering",
            completed: false,
          },
        ],
        tools: [
          {
            name: "Figma",
            category: "Wireframes",
            templateName: "Wireframe Kit",
            templateUrl: "https://www.figma.com/community/wireframes",
            usageNote: "Draft structural flows.",
          },
          {
            name: "Miro",
            category: "Sketching",
            templateName: "Wireframe Board",
            templateUrl: "https://miro.com/templates/wireframe/",
            usageNote: "Run team critique.",
          },
        ],
      },
      {
        id: `step-${Date.now()}-4`,
        stepNumber: 4,
        title: "Usability test (moderated and unmoderated)",
        phase: "Test",
        track: "UX Research",
        nngDimension: "Behavioral · Scripted Use",
        whyGoodFit: "Validate task completion and catch comprehension gaps on interactive wireframes.",
        estimatedTime: "4d",
        effortHours: 18,
        sampleOrScope: "5–8 participants",
        riskMitigated: "Shipping usability defects to production.",
        deliverables: ["Usability Scorecard", "Task Benchmark"],
        subtasks: [
          {
            id: `sub-${Date.now()}-4a`,
            label: "Link interactive prototype states",
            completed: false,
          },
          {
            id: `sub-${Date.now()}-4b`,
            label: "Run 5–8 task sessions and rank issues",
            completed: false,
          },
        ],
        tools: [
          {
            name: "Maze",
            category: "Testing",
            templateName: "Usability Test",
            templateUrl: "https://maze.co/templates/",
            usageNote: "Measure task success.",
          },
          {
            name: "Dovetail",
            category: "Synthesis",
            templateName: "Usability Repository",
            templateUrl: "https://dovetail.com/templates/",
            usageNote: "Tag session findings.",
          },
        ],
      },
      {
        id: `step-${Date.now()}-5`,
        stepNumber: 5,
        title: "High-fidelity Designs",
        phase: "Synthesize & Deliver",
        track: "Product Design Execution",
        nngDimension: "High-Fidelity Craft",
        whyGoodFit: "Finalize production screens, empty/loading/error states, and developer specs.",
        estimatedTime: "5d",
        effortHours: 24,
        sampleOrScope: "Production UI set",
        riskMitigated: "Engineering ambiguity during build.",
        deliverables: ["Figma file", "Design System Specs"],
        deliverableProduct: "figma",
        subtasks: [
          {
            id: `sub-${Date.now()}-5a`,
            label: "Apply test fixes to high-fi components",
            completed: false,
          },
          {
            id: `sub-${Date.now()}-5b`,
            label: "Document edge states for dev handoff",
            completed: false,
          },
        ],
        tools: [
          {
            name: "Figma",
            category: "Design System",
            templateName: "Design System Kit",
            templateUrl: "https://www.figma.com/community/design-systems",
            usageNote: "Deliver dev specs.",
          },
          {
            name: "Notion",
            category: "QA",
            templateName: "Design QA List",
            templateUrl: "https://www.notion.com/templates/category/design",
            usageNote: "Final QA check.",
          },
        ],
      },
    ],
  };
}

const ROADMAP_SYSTEM_INSTRUCTION = `You are a Principal UX Research Strategist and Staff Product Design Lead.

Analyze the user's uploaded project documentation, problem statement, extra context, and constraints, and generate a sequenced UX Research & Product Design Roadmap (5 to 6 steps) selecting from the following artefacts:
Stakeholder interview, User interview, Survey and questionnaire results, Competitive analysis, Heuristic evaluation, UX audit, Analytics review, Field study, Affinity diagrams, Personas, Jobs-to-be-Done statements, Empathy map, Customer journey map, Service blueprint, Problem statement, How Might We questions, Value proposition canvas, Opportunity solution tree, Crazy 8s, Workshopping, Mood boards, Site map, Card sorting, Tree testing, User flows, Low-fidelity wireframes, Mid-fidelity wireframes, High-fidelity wireframes, AI prototype, High-fidelity Designs, Accessibility audit report, Usability test (moderated and unmoderated), A/B test, Multivariate test, First-click test results, Five-second test results, Preference test results, Heatmaps, Session recordings.

CRITICAL CONCISENESS RULES (for compact Storyflow cards):
- Keep ALL text ultra-concise, punchy, and scannable.
- "roadmapTitle": 3 to 6 words max.
- "executiveSummary": 1 short sentence (max 18 words).
- "keyInsightsFromDocs": 2 to 3 short bullet points (max 12 words each).
- Step "title": Use the exact artefact name from the list above whenever applicable.
- Step "whyGoodFit": 1 short, specific sentence (max 16 words) referencing the user's project.
- Step "estimatedTime": Compact format like "3d", "4–5d", or "1w".
- Step "sampleOrScope": Compact phrase (max 4 words, e.g., "6–8 users" or "8 key screens").
- Step "riskMitigated": Short phrase (max 8 words).
- Step "deliverables": 2 short items (2–3 words each). Follow these product deliverable requirements:
  * For "High-fidelity Designs" or high-fidelity UI: deliverable must be a "Figma file".
  * For any doc/text related deliverable (interviews, surveys, audits, heuristics, personas, JTBD, usability reports): made with Google Docs (e.g. "Google Doc Brief", "Interview Synthesis", "Audit Report").
  * For any visual (non-hi fidelity design) deliverable (flows, journey maps, low/mid wireframes, affinity diagrams): made with FigJam (e.g. "FigJam User Flow", "FigJam Wireframes", "FigJam Journey Map").
  * For AI prototypes: made with AI Studio (e.g. "AI Studio Prototype").
- Step "subtasks": 2 to 3 short checklist items (4 to 7 words each).
- Step "tools": 2 tools per step with verified URLs (https://www.figma.com/community/wireframes, https://www.figma.com/community/user-flows, https://www.figma.com/community/design-systems, https://www.figma.com/community/prototyping, https://miro.com/templates/customer-journey-map/, https://miro.com/templates/affinity-diagram/, https://miro.com/templates/card-sorting/, https://miro.com/templates/wireframe/, https://www.notion.com/templates/category/user-research, https://maze.co/templates/, https://www.optimalworkshop.com/101/card-sorting/, https://dovetail.com/templates/).`;

const roadmapSchema = {
  type: Type.OBJECT,
  properties: {
    roadmapTitle: {
      type: Type.STRING,
      description: "A crisp, domain-specific title for the generated design & research roadmap.",
    },
    executiveSummary: {
      type: Type.STRING,
      description: "A 2-3 sentence strategic synthesis of the uploaded documentation and problem statement explaining the overall sequencing strategy.",
    },
    recommendedMethodologyBalance: {
      type: Type.STRING,
      description: "Brief summary of the Attitudinal vs. Behavioral and Qualitative vs. Quantitative balance chosen for this project.",
    },
    totalEstimatedWeeks: {
      type: Type.NUMBER,
      description: "Total estimated duration in weeks across the roadmap.",
    },
    keyInsightsFromDocs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 to 4 concrete facts, constraints, or pain points extracted directly from the uploaded documentation and problem statement.",
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          stepNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          phase: {
            type: Type.STRING,
            description: "One of: Discover, Explore, Test, Listen, Synthesize & Deliver",
          },
          track: {
            type: Type.STRING,
            description: "One of: UX Research, Product Design Execution",
          },
          nngDimension: {
            type: Type.STRING,
            description: "e.g. Behavioral · Qualitative · Scripted Use",
          },
          whyGoodFit: {
            type: Type.STRING,
            description: "Project-specific explanation of why this action is a strong fit for the uploaded problem and context.",
          },
          estimatedTime: {
            type: Type.STRING,
            description: "Human-readable time range, e.g. '3–4 days' or '1.5 weeks'",
          },
          effortHours: {
            type: Type.INTEGER,
            description: "Estimated active hours of practitioner effort, e.g. 16",
          },
          sampleOrScope: {
            type: Type.STRING,
            description: "Recommended participant sample size or design scope, e.g. '6–8 target users' or '10 key wireframe screens'",
          },
          riskMitigated: {
            type: Type.STRING,
            description: "The specific product or usability failure mode this action prevents.",
          },
          deliverables: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          subtasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                completed: { type: Type.BOOLEAN },
              },
              required: ["id", "label", "completed"],
            },
          },
          tools: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                templateName: { type: Type.STRING },
                templateUrl: { type: Type.STRING },
                usageNote: { type: Type.STRING },
              },
              required: ["name", "category", "templateName", "templateUrl", "usageNote"],
            },
          },
        },
        required: [
          "id",
          "stepNumber",
          "title",
          "phase",
          "track",
          "nngDimension",
          "whyGoodFit",
          "estimatedTime",
          "effortHours",
          "sampleOrScope",
          "riskMitigated",
          "deliverables",
          "subtasks",
          "tools",
        ],
      },
    },
  },
  required: [
    "roadmapTitle",
    "executiveSummary",
    "recommendedMethodologyBalance",
    "totalEstimatedWeeks",
    "keyInsightsFromDocs",
    "steps",
  ],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // FigJam MCP Server Endpoints (Model Context Protocol JSON-RPC 2.0)
  app.post("/api/mcp/figjam", handleFigjamMcpRequest);

  app.get("/api/mcp/figjam/status", (_req, res) => {
    res.json({
      status: "connected",
      protocol: "mcp/2024-11-05",
      server: "FigJam MCP Server v1.0.0",
      capabilities: {
        tools: true,
        resources: false,
      },
      toolsCount: FIGJAM_MCP_TOOLS.length,
      tools: FIGJAM_MCP_TOOLS.map((t) => t.name),
    });
  });

  app.get("/api/mcp/figjam/tools", (_req, res) => {
    res.json({ tools: FIGJAM_MCP_TOOLS });
  });

  app.post("/api/artefact/generate", async (req, res) => {
    try {
      const {
        artefactType,
        nodeTitle = "Untitled Artefact",
        customGuidance = "",
        upstreamInputs = [],
      } = req.body || {};

      if (!artefactType) {
        res.status(400).json({ error: "Missing required field: artefactType" });
        return;
      }

      const generatedData = await generateArtefact({
        artefactType,
        nodeTitle,
        customGuidance,
        upstreamInputs,
      });

      res.json({
        type: artefactType,
        data: generatedData,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Artefact generation error:", err);
      res.status(500).json({
        error: err?.message || "Internal error generating artefact.",
      });
    }
  });

  app.post("/api/roadmap/generate", async (req, res) => {
    const {
      projectTitle = "Untitled Product Initiative",
      problemStatement = "",
      extraContext = "",
      constraints = {},
      documents = [],
    } = req.body || {};

    if (!problemStatement.trim() && (!documents || documents.length === 0)) {
      res.status(400).json({
        error: "Please provide a problem statement or upload at least one project document.",
      });
      return;
    }

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    let textDocsSummary = "";
    const docNames: string[] = [];

    if (Array.isArray(documents) && documents.length > 0) {
      for (const doc of documents) {
        if (doc?.name) docNames.push(doc.name);

        if (doc.textContent && typeof doc.textContent === "string") {
          textDocsSummary += `\n\n--- UPLOADED DOCUMENT: ${doc.name} (${doc.mimeType || "text/plain"}) ---\n${doc.textContent.slice(0, 35000)}\n--- END DOCUMENT: ${doc.name} ---`;
        } else if (doc.base64Data) {
          const lowerName = String(doc.name || "").toLowerCase();
          const mime = String(doc.mimeType || "").toLowerCase();

          // If user uploaded a .docx file, extract text from word/document.xml
          if (
            lowerName.endsWith(".docx") ||
            mime.includes("officedocument.wordprocessingml")
          ) {
            const buf = Buffer.from(doc.base64Data, "base64");
            const docxText = extractTextFromDocxBuffer(buf);
            if (docxText) {
              textDocsSummary += `\n\n--- UPLOADED DOCX DOCUMENT: ${doc.name} ---\n${docxText.slice(0, 35000)}\n--- END DOCUMENT: ${doc.name} ---`;
              continue;
            }
          }

          // Only attach supported inlineData MIME types to Gemini request
          if (SUPPORTED_INLINE_MIME_TYPES.has(mime)) {
            parts.push({
              inlineData: {
                mimeType: mime,
                data: doc.base64Data,
              },
            });
          } else {
            // Try decoding UTF-8 text from unknown document types
            try {
              const decoded = Buffer.from(doc.base64Data, "base64")
                .toString("utf8")
                .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim();
              if (decoded.length > 20) {
                textDocsSummary += `\n\n--- UPLOADED DOCUMENT: ${doc.name} ---\n${decoded.slice(0, 25000)}\n--- END DOCUMENT: ${doc.name} ---`;
              }
            } catch {
              // Ignore binary noise
            }
          }
        }
      }
    }

    const promptText = `Generate a tailored, high-impact UX Research & Product Design Roadmap for the following project.

PROJECT TITLE:
${projectTitle}

PROBLEM STATEMENT:
${problemStatement || "(See uploaded documentation)"}

EXTRA CONTEXT & GOALS:
${extraContext || "None specified"}

PROJECT CONSTRAINTS & PARAMETERS:
- Target Timeline: ${constraints.timelineWeeks || "4–6 weeks"}
- Team Composition: ${constraints.teamSize || "1 UX Researcher, 2 Product Designers"}
- Product Maturity Stage: ${constraints.productStage || "Existing Product Redesign"}
- Methodological Emphasis: ${constraints.researchFocus || "Balanced Discovery + Iterative Prototyping & Validation"}
${textDocsSummary ? `\nEXTRACTED PROJECT DOCUMENTATION:${textDocsSummary}` : ""}

Ensure the roadmap includes a thoughtful mix of UX research and product design artefacts with specific rationale, realistic time estimates, and verified tool templates.`;

    parts.push({ text: promptText });

    try {
      const parsed = await generateJsonWithModelFallback({
        parts,
        systemInstruction: ROADMAP_SYSTEM_INSTRUCTION,
        responseSchema: roadmapSchema,
      });

      if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        res.json(parsed);
        return;
      }
    } catch {
      // Proceed to fallback roadmap
    }

    // Deterministic context-aware synthesis ensures user flow is never disrupted
    const fallbackRoadmap = synthesizeFallbackRoadmapFromInputs({
      projectTitle,
      problemStatement,
      extraContext,
      constraints,
      docNames,
      extractedDocText: textDocsSummary,
    });
    res.json(fallbackRoadmap);
  });

  app.post("/api/roadmap/custom-step", async (req, res) => {
    const {
      projectTitle,
      problemStatement,
      extraContext,
      requestedMethodOrGoal,
      currentStepCount = 5,
    } = req.body || {};

    const singleStepSchema = roadmapSchema.properties.steps.items;

    try {
      const parsedStep = await generateJsonWithModelFallback({
        parts: [
          {
            text: `Create a single, detailed UX Research or Product Design roadmap step tailored to this project:
Project Title: ${projectTitle || "Product Design Project"}
Problem Statement: ${problemStatement || ""}
Extra Context: ${extraContext || ""}
Requested Method or Action Focus: ${requestedMethodOrGoal}
Assign stepNumber: ${Number(currentStepCount) + 1}.`,
          },
        ],
        systemInstruction: ROADMAP_SYSTEM_INSTRUCTION,
        responseSchema: singleStepSchema,
      });

      if (parsedStep && parsedStep.title) {
        res.json(parsedStep);
        return;
      }
    } catch {
      // Proceed to deterministic custom step
    }

    res.json({
      id: `custom-${Date.now()}`,
      stepNumber: Number(currentStepCount) + 1,
      title: requestedMethodOrGoal || "Custom UXR & Design Validation Step",
      phase: "Explore",
      track: "UX Research",
      nngDimension: "Behavioral · Qualitative · Scripted Use",
      whyGoodFit: `Directly addresses "${requestedMethodOrGoal}" within the context of ${
        projectTitle || "this initiative"
      }, ensuring critical assumptions are validated with target users.`,
      estimatedTime: "3–4 days",
      effortHours: 16,
      sampleOrScope: "5–8 participants or key workflow screens",
      riskMitigated:
        "Prevents unvalidated assumptions from reaching production engineering.",
      deliverables: [
        "Synthesized Findings & Actionable Recommendations",
        "Annotated Prototype or Research Artifact",
      ],
      subtasks: [
        {
          id: `sub-${Date.now()}-1`,
          label: `Define objectives and evaluation criteria for: ${requestedMethodOrGoal}`,
          completed: false,
        },
        {
          id: `sub-${Date.now()}-2`,
          label: "Execute sessions or design exploration using starter templates",
          completed: false,
        },
        {
          id: `sub-${Date.now()}-3`,
          label: "Review outcomes with product and engineering stakeholders",
          completed: false,
        },
      ],
      tools: [
        {
          name: "Figma",
          category: "Design & Prototyping",
          templateName: "Figma Community Wireframe & Flow Templates",
          templateUrl: "https://www.figma.com/community/wireframes",
          usageNote: "Structure visual artifacts and interactive flows.",
        },
        {
          name: "Miro",
          category: "Synthesis",
          templateName: "Miro Affinity Diagram Template",
          templateUrl: "https://miro.com/templates/affinity-diagram/",
          usageNote: "Synthesize observations and prioritize next actions.",
        },
      ],
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MethodMap server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
