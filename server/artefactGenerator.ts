/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  HEADER_STYLES,
  HERO_STYLES,
  NAV_STYLES,
  OVERLAYS,
  SCREEN_LAYOUTS,
  SECTION_TYPES,
} from "./wireframeLayout.ts";

dotenv.config();

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

function isTransientOrOverloadedError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || err?.code || err?.error?.code;
  return (
    status === 503 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("deadline_exceeded")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Schemas for the 9 Artefact Types
// ============================================================================

export const interviewScriptSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    overview: { type: Type.STRING },
    targetAudience: { type: Type.STRING },
    screenerCriteria: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    introScript: { type: Type.STRING },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING },
          purpose: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                probes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                expectedInsights: { type: Type.STRING },
              },
              required: ["question", "probes", "expectedInsights"],
            },
          },
        },
        required: ["theme", "purpose", "questions"],
      },
    },
    wrapUpScript: { type: Type.STRING },
    analysisTips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "title",
    "overview",
    "targetAudience",
    "screenerCriteria",
    "introScript",
    "sections",
    "wrapUpScript",
    "analysisTips",
  ],
};

export const usabilityScriptSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    testObjectives: { type: Type.STRING },
    methodology: { type: Type.STRING },
    setupAndMaterials: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    moderatorBriefing: { type: Type.STRING },
    scenarios: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scenarioNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          context: { type: Type.STRING },
          taskPrompt: { type: Type.STRING },
          successCriteria: { type: Type.STRING },
          observerNotes: { type: Type.STRING },
        },
        required: [
          "scenarioNumber",
          "title",
          "context",
          "taskPrompt",
          "successCriteria",
          "observerNotes",
        ],
      },
    },
    postTaskMetrics: {
      type: Type.OBJECT,
      properties: {
        seqQuestion: { type: Type.STRING },
        susScaleQuestions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["seqQuestion", "susScaleQuestions"],
    },
    debriefQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "title",
    "testObjectives",
    "methodology",
    "setupAndMaterials",
    "moderatorBriefing",
    "scenarios",
    "postTaskMetrics",
    "debriefQuestions",
  ],
};

export const userPersonaSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    role: { type: Type.STRING },
    tagline: { type: Type.STRING },
    avatarInitials: { type: Type.STRING },
    avatarColor: { type: Type.STRING },
    demographics: {
      type: Type.OBJECT,
      properties: {
        ageRange: { type: Type.STRING },
        experienceLevel: { type: Type.STRING },
        locationOrContext: { type: Type.STRING },
        techComfort: { type: Type.STRING },
      },
      required: ["ageRange", "experienceLevel", "locationOrContext", "techComfort"],
    },
    bio: { type: Type.STRING },
    coreQuote: { type: Type.STRING },
    goals: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    frustrations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    behaviors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    toolsAndEnvironment: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "name",
    "role",
    "tagline",
    "avatarInitials",
    "avatarColor",
    "demographics",
    "bio",
    "coreQuote",
    "goals",
    "frustrations",
    "behaviors",
    "toolsAndEnvironment",
  ],
};

export const userFlowSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    userGoal: { type: Type.STRING },
    startTrigger: { type: Type.STRING },
    endOutcome: { type: Type.STRING },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          stepNumber: { type: Type.INTEGER },
          label: { type: Type.STRING },
          type: {
            type: Type.STRING,
            description: "One of: start, action, decision, screen, end",
          },
          description: { type: Type.STRING },
          systemResponse: { type: Type.STRING },
          edgeCaseNote: { type: Type.STRING },
        },
        required: ["id", "stepNumber", "label", "type", "description", "systemResponse"],
      },
    },
    connections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          conditionLabel: { type: Type.STRING },
        },
        required: ["from", "to"],
      },
    },
    keyDesignConsiderations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "title",
    "userGoal",
    "startTrigger",
    "endOutcome",
    "nodes",
    "connections",
    "keyDesignConsiderations",
  ],
};

export const userJourneyMapSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    personaName: { type: Type.STRING },
    scenario: { type: Type.STRING },
    phases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          phaseName: { type: Type.STRING },
          userActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          userThoughts: { type: Type.STRING },
          sentiment: {
            type: Type.STRING,
            description: "One of: positive, neutral, negative",
          },
          sentimentScore: { type: Type.INTEGER },
          touchpoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          painPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          opportunities: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          "phaseName",
          "userActions",
          "userThoughts",
          "sentiment",
          "sentimentScore",
          "touchpoints",
          "painPoints",
          "opportunities",
        ],
      },
    },
    strategicTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["title", "personaName", "scenario", "phases", "strategicTakeaways"],
};

/** "One of: name (when to use); ..." built from a layout catalog */
const oneOf = (catalog: Record<string, string>) =>
  "One of: " + Object.entries(catalog).map(([name, use]) => `${name} (${use})`).join("; ");

const affinityNoteSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    kind: {
      type: Type.STRING,
      enum: ["insight", "pain-point", "finding", "quote"],
    },
    source: { type: Type.STRING },
  },
  required: ["text", "kind", "source"],
};

export const affinityMapSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    researchQuestion: { type: Type.STRING },
    sources: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          insight: { type: Type.STRING },
          clusters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                notes: {
                  type: Type.ARRAY,
                  items: affinityNoteSchema,
                },
              },
              required: ["label", "notes"],
            },
          },
        },
        required: ["name", "insight", "clusters"],
      },
    },
    outliers: {
      type: Type.ARRAY,
      items: affinityNoteSchema,
    },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["title", "researchQuestion", "sources", "themes", "outliers", "keyTakeaways"],
};

export const researchReportSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    executiveSummary: { type: Type.STRING },
    keyTakeaways: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    background: { type: Type.STRING },
    researchQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    methodology: {
      type: Type.OBJECT,
      properties: {
        methods: { type: Type.STRING },
        participants: { type: Type.STRING },
        timeframe: { type: Type.STRING },
      },
      required: ["methods", "participants", "timeframe"],
    },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          insight: { type: Type.STRING },
          findings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                headline: { type: Type.STRING },
                detail: { type: Type.STRING },
                severity: {
                  type: Type.STRING,
                  enum: ["critical", "high", "medium", "low"],
                },
                frequency: { type: Type.STRING },
                evidence: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      quote: { type: Type.STRING },
                      source: { type: Type.STRING },
                    },
                    required: ["quote", "source"],
                  },
                },
              },
              required: ["id", "headline", "detail", "severity", "frequency", "evidence"],
            },
          },
        },
        required: ["name", "insight", "findings"],
      },
    },
    whatWorked: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          rationale: { type: Type.STRING },
          priority: {
            type: Type.STRING,
            enum: ["now", "next", "later"],
          },
          relatedFindings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["action", "rationale", "priority", "relatedFindings"],
      },
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    nextSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    participants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          profile: { type: Type.STRING },
        },
        required: ["id", "profile"],
      },
    },
  },
  required: [
    "title",
    "executiveSummary",
    "keyTakeaways",
    "background",
    "researchQuestions",
    "methodology",
    "themes",
    "whatWorked",
    "recommendations",
    "limitations",
    "nextSteps",
    "participants",
  ],
};

export const wireframeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    screenType: {
      type: Type.STRING,
      description: "One of: mobile, web-desktop, tablet",
    },
    screenTitle: { type: Type.STRING },
    screenPurpose: { type: Type.STRING },
    layoutStructure: {
      type: Type.OBJECT,
      properties: {
        header: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            actions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["title", "actions"],
        },
        screenLayout: {
          type: Type.STRING,
          description: `How panes sit on the screen. ${oneOf(SCREEN_LAYOUTS)}`,
        },
        headerStyle: {
          type: Type.STRING,
          description: oneOf(HEADER_STYLES),
        },
        sidebarOrNav: {
          type: Type.ARRAY,
          description: "App-wide navigation destinations (3-7). Leave empty for flows that hide navigation.",
          items: { type: Type.STRING },
        },
        navStyle: {
          type: Type.STRING,
          description: `How sidebarOrNav is shown. ${oneOf(NAV_STYLES)}`,
        },
        heroStyle: {
          type: Type.STRING,
          description: `How heroOrSummary is shown. ${oneOf(HERO_STYLES)}`,
        },
        overlay: {
          type: Type.STRING,
          description: `Something open over the screen. ${oneOf(OVERLAYS)}`,
        },
        floatingAction: {
          type: Type.STRING,
          description: "Label of a floating action button (Compose, New task, Add). Leave empty if the screen has none.",
        },
        heroOrSummary: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            actions: {
              type: Type.ARRAY,
              description: "Up to 2 button labels; the first is the primary action",
              items: { type: Type.STRING },
            },
            stats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ["label", "value"],
              },
            },
          },
          required: ["title", "subtitle"],
        },
        mainSections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sectionTitle: { type: Type.STRING },
              contentType: {
                type: Type.STRING,
                description: oneOf(SECTION_TYPES),
              },
              width: {
                type: Type.STRING,
                description: "full or half. Two half sections in a row sit side by side on desktop and tablet.",
              },
              pane: {
                type: Type.STRING,
                description:
                  "primary (default), secondary (detail pane in split, right rail in aside, inspector in canvas) or overlay (inside the sheet or dialog)",
              },
              columns: {
                type: Type.ARRAY,
                description: "Table column headings, in the order title, subtitle, value, badge, action",
                items: { type: Type.STRING },
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    badge: { type: Type.STRING },
                    action: { type: Type.STRING },
                    value: {
                      type: Type.STRING,
                      description: "A number shown prominently: price, amount, time, count, rating or duration",
                    },
                  },
                  required: ["title"],
                },
              },
            },
            required: ["sectionTitle", "contentType", "items"],
          },
        },
        footerOrBottomBar: {
          type: Type.OBJECT,
          properties: {
            actions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["actions"],
        },
      },
      required: ["header", "mainSections"],
    },
    interactiveStates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stateName: { type: Type.STRING },
          description: { type: Type.STRING },
          keyDifferences: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["stateName", "description", "keyDifferences"],
      },
    },
    uiComponentsUsed: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    designNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    "title",
    "screenType",
    "screenTitle",
    "screenPurpose",
    "layoutStructure",
    "interactiveStates",
    "uiComponentsUsed",
    "designNotes",
  ],
};

export const surveyQuestionsSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    objective: { type: Type.STRING },
    targetRespondent: { type: Type.STRING },
    estimatedMinutes: { type: Type.INTEGER },
    introNote: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          number: { type: Type.INTEGER },
          question: { type: Type.STRING },
          type: {
            type: Type.STRING,
            description: "One of: single-choice, multiple-choice, likert-scale, open-text, nps",
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          scaleMinLabel: { type: Type.STRING },
          scaleMaxLabel: { type: Type.STRING },
          required: { type: Type.BOOLEAN },
          logicRule: { type: Type.STRING },
          purposeRationale: { type: Type.STRING },
        },
        required: ["id", "number", "question", "type", "required", "purposeRationale"],
      },
    },
    closingNote: { type: Type.STRING },
  },
  required: [
    "title",
    "objective",
    "targetRespondent",
    "estimatedMinutes",
    "introNote",
    "questions",
    "closingNote",
  ],
};

// ============================================================================
// Core Execution Function with Model Fallback
// ============================================================================

export async function executeGeminiJsonGeneration(params: {
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  systemInstruction: string;
  responseSchema: any;
  temperature?: number;
}): Promise<any> {
  for (const modelName of FALLBACK_MODELS) {
    if (isModelCoolingDown(modelName)) {
      continue;
    }

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const config: Record<string, any> = {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
          temperature: params.temperature ?? 0.3,
        };

        if (modelName.startsWith("gemini-3")) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: params.parts },
          config,
        });

        const rawText = response.text;
        if (!rawText) throw new Error(`Empty response from ${modelName}`);
        return JSON.parse(rawText.trim());
      } catch (err: any) {
        console.warn(`[Gemini] ${modelName} attempt ${attempt} failed:`, err?.message || err);
        if (isQuotaExhaustedError(err)) {
          markModelRateLimited(modelName, 1800);
          break;
        }
        if (isTransientOrOverloadedError(err)) {
          if (attempt < maxAttempts) {
            await sleep(600 * attempt);
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

// ============================================================================
// Fallback Synthesizers (High-quality deterministic generators)
// ============================================================================

function extractSummaryTextFromInputs(upstreamInputs: any[]): string {
  const parts: string[] = [];
  for (const input of upstreamInputs) {
    if (input.type === "drive-folder" || input.driveFolderName) {
      const driveLabel = input.driveItemKind === "file" ? "Google Doc" : "Google Drive Folder";
      parts.push(`[${driveLabel}: ${input.driveFolderName || input.title}]: (${input.documents?.length || 0} synced documents)`);
    }
    if (input.contextText?.trim()) {
      parts.push(`[${input.title || "Context"}]: ${input.contextText.trim()}`);
    }
    if (input.documents && Array.isArray(input.documents)) {
      for (const doc of input.documents) {
        if (doc.textContent) {
          parts.push(`[File: ${doc.name}]: ${doc.textContent.slice(0, 1500)}`);
        }
      }
    }
    if (input.generatedData) {
      parts.push(`[Previous Asset: ${input.title} (${input.type})]: ${JSON.stringify(input.generatedData).slice(0, 1500)}`);
    }
  }
  return parts.join("\n\n") || "Modern digital user experience workflow";
}

function synthesizeFallbackInterviewScript(title: string, summary: string): any {
  return {
    title: title || "User Interview Script",
    overview: `Qualitative exploration into user goals, mental models, and pain points based on: ${summary.slice(0, 160)}...`,
    targetAudience: "Primary end-users and workflow owners affected by the current experience.",
    screenerCriteria: [
      "Actively uses product or related workflow at least 2–3 times per week",
      "Has experienced recent friction or workarounds during core tasks",
      "Willing to share screen and talk through real past scenarios",
    ],
    introScript:
      "Thank you so much for taking the time today! We are looking to improve the product experience. There are no right or wrong answers—we want your honest thoughts, frustrations, and candid feedback. Everything you say is confidential.",
    sections: [
      {
        theme: "Warm-up & Role Context",
        purpose: "Establish rapport and understand baseline daily responsibilities",
        questions: [
          {
            question: "Could you walk me through what a typical day looks like in your role?",
            probes: ["How does this task fit into your team's workflow?", "What tools do you open first thing in the morning?"],
            expectedInsights: "Baseline workflow context and role responsibilities",
          },
          {
            question: "When did you last need to complete this workflow? How did that go?",
            probes: ["What triggered you to do it?", "Were there any surprises or roadblocks?"],
            expectedInsights: "Natural triggers and recent memory recall",
          },
        ],
      },
      {
        theme: "Core Pain Points & Workarounds",
        purpose: "Uncover deep friction points, mental hurdles, and compensatory behaviors",
        questions: [
          {
            question: "What is the most frustrating or time-consuming part of this process right now?",
            probes: ["Where do you feel like you waste the most effort?", "Have you ever had to ask a teammate for help?"],
            expectedInsights: "Specific functional breakdowns and emotional tension",
          },
          {
            question: "Have you created any personal shortcuts, spreadsheets, or workarounds?",
            probes: ["Why is the existing system insufficient for that step?", "How long have you been doing it that way?"],
            expectedInsights: "Implicit requirements and unmet product needs",
          },
        ],
      },
      {
        theme: "Ideal State & Expectations",
        purpose: "Identify aspirations, value drivers, and willingness to change",
        questions: [
          {
            question: "If you had a magic wand and could change one thing about this experience, what would it be?",
            probes: ["How would that change your daily efficiency?", "What would you do with the saved time?"],
            expectedInsights: "Highest-priority value proposition and user aspiration",
          },
        ],
      },
    ],
    wrapUpScript:
      "That covers all my main questions! Is there anything about your experience that I didn't ask about, but you think we should know? Thank you again for your valuable time and insight.",
    analysisTips: [
      "Transcribe and tag quotes by emotional intensity (frustration vs delight)",
      "Cluster recurring workarounds into unmet functional requirements",
      "Cross-reference user self-reports with behavioral analytics",
    ],
  };
}

function synthesizeFallbackUsabilityScript(title: string, summary: string): any {
  return {
    title: title || "Usability Test Protocol",
    testObjectives: `Evaluate task success rate, discoverability of core actions, and user confusion points for: ${summary.slice(0, 140)}...`,
    methodology: "Moderated Remote Think-Aloud Usability Testing (45 minutes per participant)",
    setupAndMaterials: [
      "Interactive prototype link with populated test data",
      "Video call recording software with screen sharing",
      "Observer note-taking grid mapped to task success metrics",
    ],
    moderatorBriefing:
      "Today we will be trying out a prototype. I want to emphasize that we are testing the design, NOT you. You cannot do anything wrong here! As you navigate, please think out loud—tell me what you are looking at, what you expect to happen, and if anything confuses you.",
    scenarios: [
      {
        scenarioNumber: 1,
        title: "First Impressions & Navigation Discovery",
        context: "You have just logged in on a Monday morning to check your pending tasks.",
        taskPrompt: "Look at the main screen. Without clicking anything yet, tell me what you understand this page to be and where you would go first.",
        successCriteria: "Participant correctly identifies primary navigation and dashboard status within 45 seconds.",
        observerNotes: "Note which UI elements draw eye attention first and whether hierarchy is clear.",
      },
      {
        scenarioNumber: 2,
        title: "Execute Primary Creation Workflow",
        context: "You need to create a new entry with specific parameters from your project brief.",
        taskPrompt: "Please start and complete the creation process for a new item. Stop when you see the confirmation.",
        successCriteria: "User locates the primary CTA button, completes required fields without error, and confirms entry.",
        observerNotes: "Track hesitation at form fields, validation error triggers, and time to completion.",
      },
      {
        scenarioNumber: 3,
        title: "Modify Settings & Handle Edge Case",
        context: "You realize you need to update one attribute and share the result with a collaborator.",
        taskPrompt: "Find the item you just created, change its category, and send the link to a teammate.",
        successCriteria: "User navigates to edit mode, successfully updates category, and executes share action.",
        observerNotes: "Watch for discoverability of secondary action menus and confirmation toasts.",
      },
    ],
    postTaskMetrics: {
      seqQuestion: "Overall, how easy or difficult was it to complete these tasks on a scale from 1 (Very Difficult) to 7 (Very Easy)?",
      susScaleQuestions: [
        "I think that I would like to use this system frequently.",
        "I found the system unnecessarily complex.",
        "I thought the system was easy to use.",
        "I would imagine that most people would learn to use this system very quickly.",
      ],
    },
    debriefQuestions: [
      "What was the most intuitive part of this experience?",
      "If you could change one confusing screen or interaction, which one would it be?",
      "How did this compare to how you currently complete this task in your daily work?",
    ],
  };
}

function synthesizeFallbackUserPersona(title: string, summary: string): any {
  return {
    name: "Alex Morgan",
    role: "Senior Operations Specialist",
    tagline: "Driven by efficiency, overwhelmed by fragmented tools.",
    avatarInitials: "AM",
    avatarColor: "#3B82F6",
    demographics: {
      ageRange: "31–38",
      experienceLevel: "6+ years in operational workflows",
      locationOrContext: "Hybrid workplace / Fast-paced team",
      techComfort: "High proficiency with web apps, low tolerance for slow UI",
    },
    bio: `Alex manages multi-step workflows daily. Based on ${summary.slice(0, 160)}..., Alex spends significant time coordinating between legacy systems, trying to eliminate manual errors and keep stakeholders informed without drowning in repetitive busywork.`,
    coreQuote: "If a software requires 12 clicks to do something I do 30 times a day, I'll just write my own spreadsheet.",
    goals: [
      "Execute high-frequency tasks in under 2 minutes with zero errors",
      "Gain real-time visibility into status updates across team members",
      "Automate repetitive handoffs and notifications seamlessly",
    ],
    frustrations: [
      "Hidden navigation menus and inconsistent action button locations",
      "Lack of clear feedback when a background process is processing",
      "Having to re-enter the same information across multiple tabs",
    ],
    behaviors: [
      "Keeps multiple browser tabs open simultaneously during deep work",
      "Uses keyboard shortcuts whenever supported to save time",
      "Relies on quick scanning rather than reading lengthy instructions",
    ],
    toolsAndEnvironment: [
      "Slack / Microsoft Teams",
      "Figma / Miro boards",
      "Google Workspace & Excel",
      "Dual-monitor desktop setup",
    ],
  };
}

function synthesizeFallbackUserFlow(title: string, summary: string): any {
  return {
    title: title || "Core User Task Flow",
    userGoal: `Efficiently complete core interaction defined by: ${summary.slice(0, 120)}...`,
    startTrigger: "User clicks 'Get Started' or receives email notification trigger",
    endOutcome: "User successfully completes task and views synthesized confirmation status",
    nodes: [
      {
        id: "step-1",
        stepNumber: 1,
        label: "Entry Trigger & Dashboard",
        type: "start",
        description: "User lands on dashboard and views pending notification indicator",
        systemResponse: "Displays prioritized action banner with 1-click CTA",
      },
      {
        id: "step-2",
        stepNumber: 2,
        label: "Configure Parameters",
        type: "action",
        description: "User enters project requirements, selects options, and uploads asset",
        systemResponse: "Inline field validation provides immediate green checkmarks",
      },
      {
        id: "step-3",
        stepNumber: 3,
        label: "Validation Decision",
        type: "decision",
        description: "System verifies input completeness and checks permission credentials",
        systemResponse: "Routes to review screen if valid; highlights missing fields if invalid",
        edgeCaseNote: "Handles network timeout with automatic draft autosave",
      },
      {
        id: "step-4",
        stepNumber: 4,
        label: "Preview & Confirm Screen",
        type: "screen",
        description: "User inspects summary breakdown and approves execution",
        systemResponse: "Renders interactive preview with edit pills for quick tweaks",
      },
      {
        id: "step-5",
        stepNumber: 5,
        label: "Success & Handoff State",
        type: "end",
        description: "User receives shareable output link and celebration toast",
        systemResponse: "Triggers background sync and copies direct link to clipboard",
      },
    ],
    connections: [
      { from: "step-1", to: "step-2", conditionLabel: "User clicks primary CTA" },
      { from: "step-2", to: "step-3", conditionLabel: "Form submitted" },
      { from: "step-3", to: "step-4", conditionLabel: "Inputs Valid" },
      { from: "step-3", to: "step-2", conditionLabel: "Missing Info (Retry)" },
      { from: "step-4", to: "step-5", conditionLabel: "Confirmed by user" },
    ],
    keyDesignConsiderations: [
      "Ensure back button preserves dirty form state without resetting user inputs",
      "Display progress bar indicator so users anticipate remaining steps",
      "Provide inline error recovery rather than generic error popups",
    ],
  };
}

function synthesizeFallbackUserJourneyMap(title: string, summary: string): any {
  return {
    title: title || "Customer Journey Map",
    personaName: "Primary End User",
    scenario: `Navigating end-to-end lifecycle for: ${summary.slice(0, 140)}...`,
    phases: [
      {
        phaseName: "Discovery & Trigger",
        userActions: [
          "Identifies recurring bottleneck in current routine",
          "Searches for solution or follows team invitation link",
        ],
        userThoughts: "There has to be a faster way to handle this without all the manual hassle.",
        sentiment: "neutral",
        sentimentScore: 3,
        touchpoints: ["Email invite", "Landing Page", "Colleague referral"],
        painPoints: ["Unclear pricing or setup friction", "Uncertainty if tool solves specific edge case"],
        opportunities: ["Provide 1-click interactive playground demo", "Highlight social proof and case studies"],
      },
      {
        phaseName: "Onboarding & First Setup",
        userActions: [
          "Signs up and connects primary data source",
          "Explores canvas workspace and pre-built templates",
        ],
        userThoughts: "Will this actually understand my team's unique documentation?",
        sentiment: "positive",
        sentimentScore: 4,
        touchpoints: ["Sign-up modal", "Welcome tour checklist", "Empty state canvas"],
        painPoints: ["Too many tutorial tooltips can feel overwhelming", "Unclear which block to place first"],
        opportunities: ["Show contextual ghost blocks that suggest the next logical step", "Pre-load sample project"],
      },
      {
        phaseName: "Execution & Synthesis",
        userActions: [
          "Connects context blocks to research and design artefacts",
          "Generates tailored scripts, wireframes, and persona variations",
        ],
        userThoughts: "Wow, this saved me 4 hours of drafting from a blank page!",
        sentiment: "positive",
        sentimentScore: 5,
        touchpoints: ["Canvas connection wires", "Detailed inspection drawer", "Generation stream"],
        painPoints: ["Waiting during complex AI model generation", "Need to refine specific sections without regenerating everything"],
        opportunities: ["Provide inline editing directly in the preview", "Support multi-variation branching"],
      },
      {
        phaseName: "Handoff & Stakeholder Review",
        userActions: [
          "Shares generated deliverables with product managers and engineers",
          "Incorporates design critique feedback into second revision",
        ],
        userThoughts: "I hope my stakeholders can easily digest this format without needing extra training.",
        sentiment: "positive",
        sentimentScore: 4,
        touchpoints: ["Export button", "Markdown copy", "Interactive wireframe review"],
        painPoints: ["Stakeholders asking for formats in Google Docs / Figma", "Version tracking confusion"],
        opportunities: ["One-click export to Markdown, Figma-ready JSON, and clipboard", "Version history stamps"],
      },
    ],
    strategicTakeaways: [
      "The highest friction occurs during initial onboarding—guided template flows drastically reduce bounce rate.",
      "The 'aha moment' arrives when generated artefacts incorporate specific user-uploaded context.",
      "Fast export options prevent drop-off during executive presentations.",
    ],
  };
}

function synthesizeFallbackAffinityMap(title: string, summary: string): any {
  return {
    title: title || "Research Affinity Map",
    researchQuestion: `What gets in the way of users today? Context: ${summary.slice(0, 140)}...`,
    sources: ["P1", "P2", "P3", "P4", "P5"],
    themes: [
      {
        name: "Setup feels risky",
        insight: "Users delay setup because they cannot predict what the tool will change.",
        clusters: [
          {
            label: "Unclear first step",
            notes: [
              { text: "Did not know which block to add first on the empty canvas", kind: "pain-point", source: "P1" },
              { text: "\"I just stared at it for a minute, then closed the tab.\"", kind: "quote", source: "P3" },
              { text: "3 of 5 participants opened the help page before acting", kind: "finding", source: "P1, P3, P4" },
            ],
          },
          {
            label: "Fear of breaking things",
            notes: [
              { text: "Worried that connecting a data source would overwrite team files", kind: "pain-point", source: "P2" },
              { text: "Asked for a preview before any change is saved", kind: "finding", source: "P5" },
              { text: "Trust grows when users can undo safely", kind: "insight", source: "P2, P5" },
            ],
          },
        ],
      },
      {
        name: "Work is rebuilt by hand",
        insight: "Users copy the same content between tools because outputs do not travel.",
        clusters: [
          {
            label: "Copy and paste between tools",
            notes: [
              { text: "Pastes findings from notes into slides, then into the backlog", kind: "finding", source: "P4" },
              { text: "\"Half my week is moving text from one place to another.\"", kind: "quote", source: "P2" },
              { text: "Formatting is lost on every paste", kind: "pain-point", source: "P1" },
            ],
          },
          {
            label: "Version confusion",
            notes: [
              { text: "Stakeholders comment on old copies of the report", kind: "pain-point", source: "P3" },
              { text: "One shared source would remove most rework", kind: "insight", source: "P3, P4" },
            ],
          },
        ],
      },
      {
        name: "Sharing needs a story",
        insight: "Stakeholders act on findings only when they see the evidence behind them.",
        clusters: [
          {
            label: "Evidence wins arguments",
            notes: [
              { text: "Clips and quotes convinced the PM more than the summary", kind: "finding", source: "P5" },
              { text: "\"Show me who said it, or it is just your opinion.\"", kind: "quote", source: "P4" },
              { text: "Link each insight to its raw notes", kind: "insight", source: "P4, P5" },
            ],
          },
        ],
      },
    ],
    outliers: [
      { text: "Wants a dark mode for late-night synthesis", kind: "finding", source: "P1" },
    ],
    keyTakeaways: [
      "Reduce setup risk with previews and undo before asking users to connect data.",
      "Make outputs travel between tools so findings are not rebuilt by hand.",
      "Keep the evidence (quotes, sources) attached to every insight that gets shared.",
    ],
  };
}

function synthesizeFallbackResearchReport(title: string, summary: string): any {
  return {
    title: title || "UX Research Report",
    executiveSummary:
      "Users want the tool to save them time, but setup feels risky and outputs do not travel between tools. Fix setup confidence first: it blocks every other benefit. Then make findings easy to share with their evidence attached.",
    keyTakeaways: [
      "Setup is the biggest barrier: users delay it because they cannot predict what will change.",
      "Users rebuild the same content by hand across tools every week.",
      "Stakeholders act on findings only when they can see the evidence.",
    ],
    background: `This study informs what the team builds next. Context: ${summary.slice(0, 160)}...`,
    researchQuestions: [
      "What stops new users from completing setup?",
      "How do users move research outputs between tools today?",
      "What makes stakeholders trust and act on findings?",
    ],
    methodology: {
      methods: "Remote semi-structured interviews with a short task walkthrough.",
      participants: "5 participants who run research or design work at least weekly.",
      timeframe: "Not stated in the sources.",
    },
    themes: [
      {
        name: "Setup feels risky",
        insight: "Users delay setup because they cannot predict what the tool will change.",
        findings: [
          {
            id: "F1",
            headline: "Most participants did not know what to do first on the empty canvas.",
            detail: "Participants paused or left the page before adding a block. Without a starting point, the first session ends before users see any value.",
            severity: "high",
            frequency: "3 of 5 participants",
            evidence: [
              { quote: "I just stared at it for a minute, then closed the tab.", source: "P3" },
            ],
          },
          {
            id: "F2",
            headline: "Participants feared that connecting data would overwrite team files.",
            detail: "Users asked for a preview before any change is saved. Fear of breaking shared work stops them from connecting real data.",
            severity: "critical",
            frequency: "2 of 5 participants",
            evidence: [
              { quote: "If this touches the team drive, I need to know exactly what it does.", source: "P2" },
            ],
          },
        ],
      },
      {
        name: "Work is rebuilt by hand",
        insight: "Users copy the same content between tools because outputs do not travel.",
        findings: [
          {
            id: "F3",
            headline: "Participants spend hours each week copying findings between tools.",
            detail: "Findings move from notes to slides to the backlog by hand, and formatting is lost on every paste.",
            severity: "medium",
            frequency: "4 of 5 participants",
            evidence: [
              { quote: "Half my week is moving text from one place to another.", source: "P2" },
            ],
          },
        ],
      },
    ],
    whatWorked: [
      "Participants valued generated drafts that used their own uploaded context.",
      "Linking quotes to participants made findings more convincing to stakeholders.",
    ],
    recommendations: [
      {
        action: "Show a preview of every change before users connect a data source.",
        rationale: "Removes the main reason users delay setup.",
        priority: "now",
        relatedFindings: ["F2"],
      },
      {
        action: "Add a guided first step on the empty canvas.",
        rationale: "Gives users a clear starting point so the first session shows value.",
        priority: "now",
        relatedFindings: ["F1"],
      },
      {
        action: "Export findings to docs and slides with formatting and sources kept.",
        rationale: "Stops users rebuilding the same content by hand.",
        priority: "next",
        relatedFindings: ["F3"],
      },
    ],
    limitations: [
      "Small qualitative sample: treat counts as direction, not as percentages of all users.",
      "All participants were existing users, so first-time users may differ.",
    ],
    nextSteps: [
      "Test a setup preview prototype with 5 new users.",
      "Measure how many users finish setup before and after the change.",
    ],
    participants: [
      { id: "P1", profile: "UX researcher, in-house team" },
      { id: "P2", profile: "Research ops lead, agency" },
      { id: "P3", profile: "Product designer, startup" },
      { id: "P4", profile: "Product manager, enterprise" },
      { id: "P5", profile: "Design lead, enterprise" },
    ],
  };
}

/** Device the user named in the title or guidance, e.g. "Focus on mobile" */
function requestedScreenType(text: string): "mobile" | "tablet" | "web-desktop" | null {
  const t = text.toLowerCase();
  if (/\b(mobile|phone|iphone|android|ios)\b/.test(t)) return "mobile";
  if (/\b(tablet|ipad)\b/.test(t)) return "tablet";
  if (/\b(desktop|web app|website|browser)\b/.test(t)) return "web-desktop";
  return null;
}

function synthesizeFallbackWireframe(title: string, summary: string): any {
  return {
    title: title || "Key Screen Wireframe",
    screenType: "web-desktop",
    screenTitle: "Workspace Overview & Task Hub",
    screenPurpose: `Provide a focused command center addressing: ${summary.slice(0, 140)}...`,
    layoutStructure: {
      header: {
        title: "Product Workspace",
        actions: ["Search...", "Notifications (3)", "+ New Project", "User Profile"],
      },
      sidebarOrNav: ["Dashboard", "Artefact Canvas", "Research Repository", "Team Settings", "Help & Docs"],
      heroOrSummary: {
        title: "Active Strategy Overview",
        subtitle: "Track progress, connected context sources, and generated design deliverables.",
        stats: [
          { label: "Active Contexts", value: "3 Sources" },
          { label: "Generated Assets", value: "6 Artefacts" },
          { label: "Team Alignment", value: "94%" },
        ],
      },
      mainSections: [
        {
          sectionTitle: "Connected Design Pipeline",
          contentType: "cards",
          items: [
            {
              title: "User Interview Protocol",
              subtitle: "Connected to Mobile Brief (2 uploaded PDFs)",
              badge: "Generated",
              action: "View Script",
            },
            {
              title: "Primary Persona: Alex Morgan",
              subtitle: "Synthesized from 12 customer interview notes",
              badge: "Up to date",
              action: "Inspect Persona",
            },
            {
              title: "Checkout Flow Wireframe",
              subtitle: "Branching from User Flow V2",
              badge: "Ready",
              action: "Open Canvas",
            },
          ],
        },
        {
          sectionTitle: "Quick Input & Context Ingestion",
          contentType: "form",
          items: [
            {
              title: "Context Title",
              subtitle: "e.g. Q3 Growth Initiative Requirements",
            },
            {
              title: "Upload Supporting Documents",
              subtitle: "Drop PDFs, Markdown briefs, or user interview transcripts here",
              badge: "Drag & Drop",
              action: "Browse Files",
            },
          ],
        },
      ],
      footerOrBottomBar: {
        actions: ["Auto-save active", "Vite Dev Server Connected", "Export All Artifacts (.zip)"],
      },
    },
    interactiveStates: [
      {
        stateName: "Default State",
        description: "Populated dashboard showing active pipelines, recent deliverables, and status metrics.",
        keyDifferences: ["All cards show generated badges", "Hero stats reflect 100% completed items"],
      },
      {
        stateName: "Empty State",
        description: "First-time user view before any context blocks or artefacts have been generated.",
        keyDifferences: [
          "Main canvas shows welcoming starter diagram with pulsing connection handles",
          "CTA button encourages dragging first Context block from side panel",
        ],
      },
      {
        stateName: "Generating State",
        description: "Background AI synthesis in progress with live status step tracker.",
        keyDifferences: [
          "Target card displays shimmering loading border",
          "Inspect button changes to 'Synthesizing inputs...'",
        ],
      },
    ],
    uiComponentsUsed: [
      "Collapsible Left Sidebar Navigation",
      "Metric Stat Cards with Sparklines",
      "Interactive Node Grid with Connector Handles",
      "Slide-over Detail Inspection Sheet",
      "Multi-file Upload Dropzone with progress bar",
    ],
    designNotes: [
      "Maintain 8px spatial grid throughout cards and form fields",
      "Ensure high contrast on status badges for WCAG AA compliance",
      "Provide sticky bottom action bar for primary actions on smaller viewport heights",
    ],
  };
}

function synthesizeFallbackSurveyQuestions(title: string, summary: string): any {
  return {
    title: title || "User Research Survey",
    objective: `Gather quantitative validation and user sentiment metrics for: ${summary.slice(0, 140)}...`,
    targetRespondent: "Target customers who interact with similar digital workflows weekly.",
    estimatedMinutes: 5,
    introNote:
      "Thank you for sharing your feedback! This survey will take about 5 minutes to complete. Your responses are completely anonymous and will directly shape the future product experience.",
    questions: [
      {
        id: "q-1",
        number: 1,
        question: "How frequently do you perform this core workflow in your current routine?",
        type: "single-choice",
        options: ["Daily (multiple times a day)", "2–4 times a week", "About once a week", "A few times a month", "Rarely / Never"],
        required: true,
        logicRule: "If 'Rarely / Never', route to screener disqualification",
        purposeRationale: "Screener question to segment high-intent vs casual participants",
      },
      {
        id: "q-2",
        number: 2,
        question: "Overall, how satisfied are you with your current method for completing this task?",
        type: "likert-scale",
        scaleMinLabel: "1 - Extremely Dissatisfied",
        scaleMaxLabel: "5 - Extremely Satisfied",
        required: true,
        purposeRationale: "Baseline Customer Satisfaction (CSAT) benchmark metric",
      },
      {
        id: "q-3",
        number: 3,
        question: "Which of the following pain points have you experienced in the past 30 days? (Select all that apply)",
        type: "multiple-choice",
        options: [
          "Too many clicks or steps to complete routine actions",
          "Slow loading times or lagging system performance",
          "Difficulty finding the information or settings I need",
          "Lack of collaboration or easy sharing with my team",
          "Frequent data entry errors or lack of validation",
          "Other (please specify)",
        ],
        required: true,
        purposeRationale: "Quantify relative frequency of top friction vectors",
      },
      {
        id: "q-4",
        number: 4,
        question: "How likely are you to recommend this product workflow to a coworker or friend in your industry?",
        type: "nps",
        scaleMinLabel: "0 - Not at all likely",
        scaleMaxLabel: "10 - Extremely likely",
        required: true,
        purposeRationale: "Standard Net Promoter Score (NPS) loyalty indicator",
      },
      {
        id: "q-5",
        number: 5,
        question: "What is the single most valuable improvement or feature we could add to make your daily job easier?",
        type: "open-text",
        required: false,
        purposeRationale: "Qualitative voice-of-customer discovery for roadmap prioritization",
      },
    ],
    closingNote:
      "Thank you so much! Your candid input helps us build software that genuinely saves you time and effort.",
  };
}

// ============================================================================
// Public Dispatcher: generateArtefact
// ============================================================================

export async function generateArtefact(params: {
  artefactType: string;
  nodeTitle: string;
  customGuidance?: string;
  upstreamInputs: Array<{
    nodeId: string;
    type: string;
    title: string;
    contextText?: string;
    driveFolderName?: string;
    driveFolderId?: string;
    driveItemKind?: "folder" | "file";
    documents?: Array<{
      name: string;
      mimeType: string;
      textContent?: string;
      base64Data?: string;
    }>;
    generatedSummary?: string;
    generatedData?: any;
  }>;
}): Promise<any> {
  const { artefactType, nodeTitle, customGuidance = "", upstreamInputs = [] } = params;

  // Build aggregate textual context and inline documents
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  let contextDescription = "";
  if (upstreamInputs.length === 0) {
    contextDescription = "No upstream nodes connected yet. Generate a standard high-quality professional baseline example.";
  } else {
    contextDescription = `UPSTREAM CONNECTED SOURCES (${upstreamInputs.length} total source blocks):\n\n`;
    for (let i = 0; i < upstreamInputs.length; i++) {
      const inp = upstreamInputs[i];
      contextDescription += `--- SOURCE #${i + 1}: [Type: ${inp.type}] "${inp.title}" ---\n`;
      if (inp.driveFolderName) {
        contextDescription += `${inp.driveItemKind === "file" ? "Google Doc" : "Google Drive Folder"}: ${inp.driveFolderName}\n`;
      }
      if (inp.contextText?.trim()) {
        contextDescription += `Notes / Text Context:\n${inp.contextText.trim()}\n`;
      }
      if (inp.documents && inp.documents.length > 0) {
        contextDescription += `Attached Documents (${inp.documents.length}):\n`;
        for (const doc of inp.documents) {
          contextDescription += `• File: ${doc.name} (${doc.mimeType})\n`;
          if (doc.textContent) {
            contextDescription += `  Content excerpt:\n${doc.textContent.slice(0, 15000)}\n`;
          } else if (doc.base64Data) {
            // Attach as inlineData if supported MIME type
            const mime = doc.mimeType.toLowerCase();
            if (
              mime.startsWith("image/") ||
              mime === "application/pdf" ||
              mime.startsWith("text/")
            ) {
              parts.push({
                inlineData: { mimeType: mime, data: doc.base64Data },
              });
            }
          }
        }
      }
      if (inp.generatedData) {
        contextDescription += `Previously Generated Content from this asset:\n${JSON.stringify(inp.generatedData, null, 2).slice(0, 8000)}\n`;
      }
      contextDescription += `--- END SOURCE #${i + 1} ---\n\n`;
    }
  }

  // Choose system instructions and schemas based on artefactType
  let schema: any;
  let systemInstruction = "";
  let promptSpecifics = "";

  switch (artefactType) {
    case "interview-script":
      schema = interviewScriptSchema;
      systemInstruction =
        "You are an expert Principal UX Researcher. You design meticulous, empathetic, semi-structured user interview guides. Avoid leading questions. Focus on past concrete behaviors, specific friction moments, mental models, and deep follow-up probes.";
      promptSpecifics = `Generate a comprehensive User Interview Script titled "${nodeTitle || "User Interview Script"}". Ensure questions dig into the real challenges detailed in the upstream context.`;
      break;

    case "usability-script":
      schema = usabilityScriptSchema;
      systemInstruction =
        "You are a Staff UX Usability Specialist. You design rigorous usability testing protocols and task scenarios with clear success criteria, observer guidance, thinking-aloud instructions, and standardized metric scales (SEQ and SUS).";
      promptSpecifics = `Generate an interactive Usability Testing Script & Protocol titled "${nodeTitle || "Usability Test Protocol"}". Structure realistic, action-oriented task scenarios that evaluate the workflows in the upstream context.`;
      break;

    case "user-persona":
      schema = userPersonaSchema;
      systemInstruction =
        "You are a Lead Product Design Strategist. You create deeply grounded, non-superficial User Personas based on empirical qualitative observations, role realities, core emotional drivers, frustrations, and behavioral tendencies.";
      promptSpecifics = `Generate a rich, multi-dimensional User Persona titled "${nodeTitle || "Primary User Persona"}". Tie their goals, frustrations, and daily behaviors directly to the problems described in the upstream context.`;
      break;

    case "user-flow":
      schema = userFlowSchema;
      systemInstruction =
        "You are a Principal Information Architect and Interaction Designer. You map crisp, logical User Flows with start triggers, decision diamonds, system responses, edge-case recovery paths, and success outcomes.";
      promptSpecifics = `Generate an end-to-end User Flow titled "${nodeTitle || "Core User Flow"}". Include 5 to 7 logical sequence nodes (start, actions, decisions with branching conditionLabels, screens, end).`;
      break;

    case "user-journey-map":
      schema = userJourneyMapSchema;
      systemInstruction =
        "You are a Senior Customer Experience Architect. You create detailed Customer Journey Maps across chronological lifecycle phases, tracking user actions, touchpoints, thoughts, sentiment shifts (with numeric scores 1-5), friction points, and concrete product opportunities.";
      promptSpecifics = `Generate a Customer Journey Map titled "${nodeTitle || "User Journey Map"}". Define 4 to 5 chronological phases reflecting the user journey in the upstream context.`;
      break;

    case "affinity-map":
      schema = affinityMapSchema;
      systemInstruction = `You are a Principal UX Researcher who synthesises qualitative research with affinity mapping. You follow these rules:
- Work bottom-up. Read every source first, then let themes emerge from the notes. Never start from preset categories such as "Usability" or "Features".
- One note is one atomic observation, at most 20 words, short enough for a sticky note. Never put two ideas on one note.
- Stay true to the data. Quotes are verbatim and in double quotes. Never invent participants, numbers or quotes that the sources do not support.
- Tag every note with its source (participant ID such as "P3", document name, or "Survey"). Use the IDs the sources already use.
- Each note has a kind: "finding" (what was observed or said), "pain-point" (friction, frustration or failure), "quote" (verbatim words), or "insight" (an interpretation of why, built on several notes).
- Group notes into clusters of 2 to 6 notes. Give each cluster a short label of 2 to 6 words.
- Group clusters into themes. The theme name is 2 to 6 words. The theme insight is one sentence that states what the data means (for example "Users delay setup because they cannot predict what will change"), never a topic label.
- Do not force notes into a theme. Put notes that fit nowhere in "outliers".
- Order themes by how many sources support them, strongest first.`;
      promptSpecifics = `Generate an Affinity Map titled "${nodeTitle || "Research Affinity Map"}". Extract notes from the research in the upstream context (transcripts, notes, survey results). Aim for 4 to 6 themes, each with 1 to 3 clusters. Set researchQuestion to the question the research answers. List every participant or source in "sources". Write 3 to 5 keyTakeaways as actionable statements for the product team.`;
      break;

    case "research-report":
      schema = researchReportSchema;
      systemInstruction = `You are a Principal UX Researcher who writes research reports that busy stakeholders read and act on. You follow these rules:
- Put conclusions first. The executive summary is 2 to 4 sentences: what we learned and what the team should do. Most readers stop there.
- Stay true to the data. Use only what the sources support. Never invent participants, numbers, quotes or dates. If the sources do not state something, write "Not stated in the sources".
- A finding is a full sentence that states what happened, for example "Most participants could not find the export option". Never use a topic label such as "Export".
- Group findings into themes. The theme insight is one sentence that states what the theme means, not a topic.
- Number findings F1, F2, F3 and so on across the whole report.
- Report frequency as a count, for example "4 of 6 participants". Do not use percentages for small samples.
- Give each finding at least one verbatim quote, without surrounding quotation marks, tagged with its source ID such as "P3". Use the IDs the sources already use.
- Rate severity by impact on users and the business: "critical" (blocks the goal or causes loss), "high" (major friction or workaround), "medium" (slows users down), "low" (minor annoyance).
- Order themes by importance and findings within a theme by severity, most severe first.
- Every recommendation is an action the team can take, links to the finding IDs it addresses, and has a priority: "now", "next" or "later".
- Include what worked well, so the team does not break it.
- State limitations honestly, such as sample size, who was not included, and method bias.
- Use plain language. No research jargon.`;
      promptSpecifics = `Generate a UX Research Report titled "${nodeTitle || "UX Research Report"}". Summarise the research in the upstream context (transcripts, notes, survey results, affinity maps, previous assets) into a findings doc. Write 3 to 5 keyTakeaways. Aim for 3 to 5 themes with 1 to 3 findings each. Write 3 to 6 recommendations. List every participant or source in "participants" with a short profile.`;
      break;

    case "wireframe": {
      schema = wireframeSchema;
      const device = requestedScreenType(`${nodeTitle} ${customGuidance}`);
      systemInstruction =
        "You are a Principal Product Designer and UI Systems Architect. You design clean, highly usable, low-to-mid-fidelity wireframe structures with responsive layout hierarchies, key UI modules, content sections, and multi-state UI definitions (default, empty, active).";
      promptSpecifics = `Generate a detailed Wireframe Architecture & Layout titled "${nodeTitle || "Key Screen Wireframe"}". ${
        device
          ? `screenType MUST be "${device}" because the user asked for it. Design the layout for that device.`
          : `Pick the screenType (mobile, tablet or web-desktop) that best fits the context; if the context names a device, use it.`
      }

Design it in this order:
1. Decide what kind of app this is and which single screen best serves the user's main goal in the context. Do not default to a generic dashboard.
2. Pick the screenLayout, headerStyle, navStyle, heroStyle and overlay that real apps of this kind use on this device.
3. Build 2-5 sections from the contentType catalog. Give each 3-8 items with specific, realistic copy from the context, and use item.value for prices, amounts, times, counts and ratings.

Patterns from real apps (adapt them, do not copy them):
- Product page: aside on desktop, standard on a phone; headerStyle back; detail, chips (sizes), reviews, carousel; footer action "Add to cart".
- Messaging or email: split on desktop with a feed of conversations and a secondary chat or article; on a phone, headerStyle back with chat.
- Sign in or sign up: centered or split-image; navStyle none; form and buttons.
- Banking or wallet home: heroStyle card, shortcuts, feed of transactions, tabbar.
- Ride hailing, delivery or travel: map; headerStyle search; feed, timeline or buttons in the sheet.
- Marketing site: navStyle header; heroStyle centered or split; features, pricing, reviews, accordion, cta.
- Project or task tool: sidebar or rail; kanban, table or checklist; floatingAction.
- Booking: calendar, chips for time slots, summary.
- Course or video: media with checklist or accordion.
- Social: posts and avatars, or heroStyle profile with tabs and gallery.
- Settings: headerStyle back; settings groups.
- Editor: canvas with primary (layers) and secondary (properties) panes.
- Analytics: stats, then chart and table as half-width sections.
Add interactive state variants (default, empty, loading or error, and one active state).`;
      break;
    }

    case "survey-questions":
      schema = surveyQuestionsSchema;
      systemInstruction =
        "You are a Quantitative UX Research Methodologist. You craft valid, unbiased survey instruments with clear screeners, Likert rating scales, balanced multiple-choice options, and purposeful open-ended prompts.";
      promptSpecifics = `Generate a structured UX Research Survey questionnaire titled "${nodeTitle || "User Research Survey"}". Include 5 to 8 questions with types (single-choice, multiple-choice, likert-scale, open-text, nps), response options, and rationale for each question.`;
      break;

    default:
      throw new Error(`Unsupported artefact type: ${artefactType}`);
  }

  const promptText = `TASK: Generate the following UX artefact:
ARTEFACT TYPE: ${artefactType}
TITLE: ${nodeTitle}
${customGuidance ? `USER GUIDANCE / FOCUS INSTRUCTIONS:\n${customGuidance}\n` : ""}
${contextDescription}

${promptSpecifics}
Produce an exhaustive, highly practical, and context-tailored JSON output adhering to the schema.`;

  parts.push({ text: promptText });

  try {
    const result = await executeGeminiJsonGeneration({
      parts,
      systemInstruction,
      responseSchema: schema,
      // Visual layouts need more variety than text documents
      temperature: artefactType === "wireframe" ? 0.8 : undefined,
    });

    if (result && typeof result === "object") {
      if (artefactType === "wireframe") {
        result.screenType = requestedScreenType(`${nodeTitle} ${customGuidance}`) || result.screenType;
      }
      return result;
    }
    console.warn(`[Gemini] All models failed for ${artefactType} "${nodeTitle}". Using the built-in template.`);
  } catch (err) {
    console.warn("Gemini generation failed, falling back to deterministic synthesis:", err);
  }

  // Fallback synthesis
  const summary = extractSummaryTextFromInputs(upstreamInputs);
  switch (artefactType) {
    case "interview-script":
      return synthesizeFallbackInterviewScript(nodeTitle, summary);
    case "usability-script":
      return synthesizeFallbackUsabilityScript(nodeTitle, summary);
    case "user-persona":
      return synthesizeFallbackUserPersona(nodeTitle, summary);
    case "user-flow":
      return synthesizeFallbackUserFlow(nodeTitle, summary);
    case "user-journey-map":
      return synthesizeFallbackUserJourneyMap(nodeTitle, summary);
    case "affinity-map":
      return synthesizeFallbackAffinityMap(nodeTitle, summary);
    case "research-report":
      return synthesizeFallbackResearchReport(nodeTitle, summary);
    case "wireframe":
      return {
        ...synthesizeFallbackWireframe(nodeTitle, summary),
        screenType: requestedScreenType(`${nodeTitle} ${customGuidance}`) || "web-desktop",
      };
    case "survey-questions":
      return synthesizeFallbackSurveyQuestions(nodeTitle, summary);
    default:
      return {};
  }
}
