/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ArtefactType,
  InterviewScriptData,
  UsabilityScriptData,
  SurveyQuestionsData,
  UserPersonaData,
  ResearchReportData,
} from "../types/artefacts";

/**
 * Returns whether an artefact type is fundamentally text/document-based
 */
export function isTextBasedArtefact(type: ArtefactType): boolean {
  return (
    type === "interview-script" ||
    type === "usability-script" ||
    type === "survey-questions" ||
    type === "user-persona" ||
    type === "research-report"
  );
}

/**
 * Formats structured artefact data into an exhaustive, human-readable Google Doc text
 */
export function formatArtefactForGoogleDoc(
  title: string,
  type: ArtefactType,
  data: any
): string {
  if (!data) return `${title}\n\nNo content generated yet.`;

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const divider = "------------------------------------------------------------\n";

  if (type === "interview-script") {
    const s = data as InterviewScriptData;
    let doc = `${s.title || title}\n`;
    doc += `UX Research User Interview Guide • Generated ${dateStr}\n\n`;
    doc += divider;
    doc += `1. RESEARCH OVERVIEW & OBJECTIVE\n\n`;
    doc += `${s.overview || "Deep qualitative exploration into participant goals and pain points."}\n\n`;
    doc += `TARGET PARTICIPANTS:\n${s.targetAudience || "Core target users"}\n\n`;

    if (s.screenerCriteria && s.screenerCriteria.length > 0) {
      doc += `SCREENER & RECRUITING CRITERIA:\n`;
      s.screenerCriteria.forEach((crit, i) => {
        doc += `  • ${crit}\n`;
      });
      doc += `\n`;
    }

    doc += divider;
    doc += `2. MODERATOR INTRODUCTION & WARM-UP SCRIPT\n\n`;
    doc += `${s.introScript || "Thank you for taking the time to speak with us today..."}\n\n`;

    doc += divider;
    doc += `3. CORE INTERVIEW THEMES & QUESTIONS\n\n`;

    if (s.sections && s.sections.length > 0) {
      s.sections.forEach((sec, secIdx) => {
        doc += `THEME ${secIdx + 1}: ${sec.theme.toUpperCase()}\n`;
        doc += `Theme Purpose: ${sec.purpose}\n\n`;

        if (sec.questions && sec.questions.length > 0) {
          sec.questions.forEach((q, qIdx) => {
            doc += `  Q${secIdx + 1}.${qIdx + 1}: ${q.question}\n`;
            if (q.probes && q.probes.length > 0) {
              doc += `    Follow-up probes:\n`;
              q.probes.forEach((p) => {
                doc += `      - ${p}\n`;
              });
            }
            if (q.expectedInsights) {
              doc += `    Target Insight: ${q.expectedInsights}\n`;
            }
            doc += `\n`;
          });
        }
      });
    }

    doc += divider;
    doc += `4. WRAP-UP & CLOSING SCRIPT\n\n`;
    doc += `${s.wrapUpScript || "Thank you again for your valuable time and feedback..."}\n\n`;

    if (s.analysisTips && s.analysisTips.length > 0) {
      doc += divider;
      doc += `5. SYNTHESIS & ANALYSIS GUIDELINES\n\n`;
      s.analysisTips.forEach((tip) => {
        doc += `  • ${tip}\n`;
      });
      doc += `\n`;
    }

    return doc;
  }

  if (type === "usability-script") {
    const u = data as UsabilityScriptData;
    let doc = `${u.title || title}\n`;
    doc += `Usability Testing Protocol & Benchmark Guide • Generated ${dateStr}\n\n`;
    doc += divider;
    doc += `1. TEST OBJECTIVES & METHODOLOGY\n\n`;
    doc += `Objectives: ${u.testObjectives}\n`;
    doc += `Methodology: ${u.methodology}\n\n`;

    if (u.setupAndMaterials && u.setupAndMaterials.length > 0) {
      doc += `REQUIRED SETUP & MATERIALS:\n`;
      u.setupAndMaterials.forEach((item) => {
        doc += `  • ${item}\n`;
      });
      doc += `\n`;
    }

    doc += divider;
    doc += `2. MODERATOR BRIEFING SCRIPT\n\n`;
    doc += `${u.moderatorBriefing || "Welcome to our testing session today..."}\n\n`;

    doc += divider;
    doc += `3. TASK SCENARIOS\n\n`;

    if (u.scenarios && u.scenarios.length > 0) {
      u.scenarios.forEach((scen) => {
        doc += `TASK SCENARIO #${scen.scenarioNumber}: ${scen.title.toUpperCase()}\n`;
        doc += `Background Context: ${scen.context}\n`;
        doc += `Prompt for Participant: "${scen.taskPrompt}"\n`;
        doc += `Success Benchmark: ${scen.successCriteria}\n`;
        if (scen.observerNotes) {
          doc += `Observer Notes: ${scen.observerNotes}\n`;
        }
        doc += `\n`;
      });
    }

    doc += divider;
    doc += `4. POST-TASK & STANDARDIZED METRICS\n\n`;
    if (u.postTaskMetrics?.seqQuestion) {
      doc += `Single Ease Question (SEQ):\n${u.postTaskMetrics.seqQuestion}\n(Scale: 1 = Very Difficult to 7 = Very Easy)\n\n`;
    }
    if (u.postTaskMetrics?.susScaleQuestions?.length) {
      doc += `System Usability Scale (SUS Items):\n`;
      u.postTaskMetrics.susScaleQuestions.forEach((q, i) => {
        doc += `  ${i + 1}. ${q} (1-5 Likert Scale)\n`;
      });
      doc += `\n`;
    }

    if (u.debriefQuestions && u.debriefQuestions.length > 0) {
      doc += divider;
      doc += `5. POST-TEST DEBRIEF QUESTIONS\n\n`;
      u.debriefQuestions.forEach((q, i) => {
        doc += `  • Q${i + 1}: ${q}\n`;
      });
      doc += `\n`;
    }

    return doc;
  }

  if (type === "survey-questions") {
    const surv = data as SurveyQuestionsData;
    let doc = `${surv.title || title}\n`;
    doc += `UX Research Survey Questionnaire • Generated ${dateStr}\n\n`;
    doc += divider;
    doc += `1. SURVEY PARAMETERS\n\n`;
    doc += `Objective: ${surv.objective}\n`;
    doc += `Target Respondent: ${surv.targetRespondent}\n`;
    doc += `Estimated Duration: ${surv.estimatedMinutes} minutes\n\n`;

    doc += divider;
    doc += `2. PARTICIPANT INTRODUCTORY NOTE\n\n`;
    doc += `${surv.introNote || "Welcome to our brief survey..."}\n\n`;

    doc += divider;
    doc += `3. SURVEY QUESTIONS\n\n`;

    if (surv.questions && surv.questions.length > 0) {
      surv.questions.forEach((q) => {
        doc += `Q${q.number}. ${q.question} [Type: ${q.type}]${q.required ? " (Required)" : ""}\n`;
        if (q.options && q.options.length > 0) {
          doc += `Response Options:\n`;
          q.options.forEach((opt, idx) => {
            doc += `  [ ] ${opt}\n`;
          });
        }
        if (q.scaleMinLabel || q.scaleMaxLabel) {
          doc += `Scale Labels: 1 = ${q.scaleMinLabel || "Low"} to 5/7 = ${q.scaleMaxLabel || "High"}\n`;
        }
        if (q.logicRule) {
          doc += `Branching Logic: ${q.logicRule}\n`;
        }
        if (q.purposeRationale) {
          doc += `Rationale: ${q.purposeRationale}\n`;
        }
        doc += `\n`;
      });
    }

    doc += divider;
    doc += `4. CLOSING NOTE\n\n`;
    doc += `${surv.closingNote || "Thank you for completing this survey!"}\n\n`;

    return doc;
  }

  if (type === "user-persona") {
    const p = data as UserPersonaData;
    let doc = `${p.name} — ${p.role}\n`;
    doc += `User Persona Profile • Generated ${dateStr}\n\n`;
    doc += `"${p.tagline || p.coreQuote}"\n\n`;
    doc += divider;
    doc += `1. PROFILE & DEMOGRAPHICS\n\n`;
    doc += `Age Range: ${p.demographics?.ageRange || "Not specified"}\n`;
    doc += `Experience Level: ${p.demographics?.experienceLevel || "Not specified"}\n`;
    doc += `Context / Location: ${p.demographics?.locationOrContext || "Not specified"}\n`;
    doc += `Tech Comfort: ${p.demographics?.techComfort || "Moderate"}\n\n`;

    doc += divider;
    doc += `2. BIO & BACKGROUND\n\n`;
    doc += `${p.bio}\n\n`;
    doc += `Core Quote: "${p.coreQuote}"\n\n`;

    doc += divider;
    doc += `3. CORE GOALS\n\n`;
    (p.goals || []).forEach((g) => {
      doc += `  • ${g}\n`;
    });
    doc += `\n`;

    doc += divider;
    doc += `4. PAIN POINTS & FRUSTRATIONS\n\n`;
    (p.frustrations || []).forEach((f) => {
      doc += `  • ${f}\n`;
    });
    doc += `\n`;

    doc += divider;
    doc += `5. BEHAVIORS & WORKFLOW HABITS\n\n`;
    (p.behaviors || []).forEach((b) => {
      doc += `  • ${b}\n`;
    });
    doc += `\n`;

    if (p.toolsAndEnvironment && p.toolsAndEnvironment.length > 0) {
      doc += divider;
      doc += `6. TOOLS & WORK ENVIRONMENT\n\n`;
      p.toolsAndEnvironment.forEach((t) => {
        doc += `  • ${t}\n`;
      });
      doc += `\n`;
    }

    return doc;
  }

  // Fallback for any other artefacts
  return `${title}\nGenerated ${dateStr}\n\n${JSON.stringify(data, null, 2)}`;
}

/* ==========================================================================
   Styled Google Doc content
   ========================================================================== */
type DocParagraphStyle = "TITLE" | "SUBTITLE" | "HEADING_1" | "HEADING_2" | "HEADING_3" | "NORMAL_TEXT";
type DocListKind = "bullet" | "numbered";

const LIST_PRESETS: Record<DocListKind, string> = {
  bullet: "BULLET_DISC_CIRCLE_SQUARE",
  numbered: "NUMBERED_DECIMAL_ALPHA_ROMAN",
};

/**
 * Builds document text plus the batchUpdate requests that style it.
 * Google Docs indexes count UTF-16 code units from 1, the same as JS string length.
 */
class GoogleDocBuilder {
  text = "";
  styleRequests: any[] = [];
  private listRun: { kind: DocListKind; start: number; end: number } | null = null;

  paragraph(
    text: string,
    options: { style?: DocParagraphStyle; list?: DocListKind; boldPrefix?: string; italic?: boolean } = {}
  ) {
    const line = text.replace(/\n+/g, " ").trim();
    const start = 1 + this.text.length;
    this.text += `${line}\n`;
    const end = 1 + this.text.length;

    if (options.style && options.style !== "NORMAL_TEXT") {
      this.styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: options.style },
          fields: "namedStyleType",
        },
      });
    }
    if (options.boldPrefix && line.startsWith(options.boldPrefix)) {
      this.styleRequests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: start + options.boldPrefix.length },
          textStyle: { bold: true },
          fields: "bold",
        },
      });
    }
    if (options.italic && line.length > 0) {
      this.styleRequests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { italic: true },
          fields: "italic",
        },
      });
    }

    // Consecutive list items share one list, so numbering does not restart
    if (options.list && this.listRun?.kind === options.list && this.listRun.end === start) {
      this.listRun.end = end;
    } else {
      this.flushList();
      if (options.list) this.listRun = { kind: options.list, start, end };
    }
    return this;
  }

  list(items: string[] | undefined, kind: DocListKind = "bullet") {
    (items || []).filter((item) => item?.trim()).forEach((item) => this.paragraph(item, { list: kind }));
    return this;
  }

  heading(text: string, level: 1 | 2 | 3) {
    return this.paragraph(text, { style: `HEADING_${level}` as DocParagraphStyle });
  }

  build() {
    this.flushList();
    return { text: this.text, styleRequests: this.styleRequests };
  }

  private flushList() {
    if (!this.listRun) return;
    this.styleRequests.push({
      createParagraphBullets: {
        range: { startIndex: this.listRun.start, endIndex: this.listRun.end },
        bulletPreset: LIST_PRESETS[this.listRun.kind],
      },
    });
    this.listRun = null;
  }
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_LABELS: Record<string, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

/**
 * Lays out a research report as a findings doc: conclusions first, then evidence, then detail
 */
function buildResearchReportDoc(title: string, r: ResearchReportData, dateStr: string) {
  const doc = new GoogleDocBuilder();
  doc.paragraph(r.title || title, { style: "TITLE" });
  doc.paragraph(`UX Research Findings • ${dateStr}`, { style: "SUBTITLE" });

  doc.heading("Executive summary", 1);
  doc.paragraph(r.executiveSummary);
  if (r.keyTakeaways?.length) {
    doc.heading("Key takeaways", 3);
    doc.list(r.keyTakeaways);
  }

  doc.heading("Research goals", 1);
  if (r.background) doc.paragraph(r.background);
  if (r.researchQuestions?.length) {
    doc.heading("Research questions", 3);
    doc.list(r.researchQuestions, "numbered");
  }

  doc.heading("Method and participants", 1);
  doc.paragraph(`Method: ${r.methodology?.methods || "Not stated"}`, { boldPrefix: "Method:" });
  doc.paragraph(`Participants: ${r.methodology?.participants || "Not stated"}`, { boldPrefix: "Participants:" });
  doc.paragraph(`Timeframe: ${r.methodology?.timeframe || "Not stated"}`, { boldPrefix: "Timeframe:" });

  doc.heading("Findings", 1);
  (r.themes || []).forEach((theme) => {
    doc.heading(theme.name, 2);
    if (theme.insight) doc.paragraph(theme.insight, { italic: true });
    (theme.findings || []).forEach((f) => {
      doc.heading(f.id ? `${f.id}. ${f.headline}` : f.headline, 3);
      const severity = SEVERITY_LABELS[f.severity] || f.severity;
      doc.paragraph(`Severity: ${severity} • Seen in: ${f.frequency}`, { boldPrefix: "Severity:" });
      if (f.detail) doc.paragraph(f.detail);
      doc.list(
        (f.evidence || []).map((e) => `“${e.quote.replace(/^["“]|["”]$/g, "")}” (${e.source})`)
      );
    });
  });

  if (r.whatWorked?.length) {
    doc.heading("What worked well", 1);
    doc.list(r.whatWorked);
  }

  if (r.recommendations?.length) {
    doc.heading("Recommendations", 1);
    r.recommendations.forEach((rec, i) => {
      doc.heading(`R${i + 1}. ${rec.action}`, 3);
      const priority = PRIORITY_LABELS[rec.priority] || rec.priority;
      const related = rec.relatedFindings?.length ? ` • Addresses: ${rec.relatedFindings.join(", ")}` : "";
      doc.paragraph(`Priority: ${priority}${related}`, { boldPrefix: "Priority:" });
      if (rec.rationale) doc.paragraph(rec.rationale);
    });
  }

  if (r.limitations?.length) {
    doc.heading("Limitations", 1);
    doc.list(r.limitations);
  }

  if (r.nextSteps?.length) {
    doc.heading("Next steps and open questions", 1);
    doc.list(r.nextSteps);
  }

  if (r.participants?.length) {
    doc.heading("Appendix: participants", 1);
    doc.list(r.participants.map((p) => `${p.id}: ${p.profile}`));
  }

  return doc.build();
}

/**
 * Returns the doc text and any batchUpdate requests that style it (headings, lists, emphasis)
 */
export function buildGoogleDocContent(
  title: string,
  type: ArtefactType,
  data: any
): { text: string; styleRequests: any[] } {
  if (data && type === "research-report") {
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return buildResearchReportDoc(title, data as ResearchReportData, dateStr);
  }
  return { text: formatArtefactForGoogleDoc(title, type, data), styleRequests: [] };
}

export interface GoogleDocCreationResult {
  documentId: string;
  documentUrl: string;
  embedUrl: string;
}

/**
 * Creates a real Google Doc in the authenticated user's Google Drive via Google Docs API
 */
export async function createGoogleDocForArtefact(params: {
  title: string;
  type: ArtefactType;
  data: any;
  accessToken: string;
}): Promise<GoogleDocCreationResult> {
  const { title, type, data, accessToken } = params;

  const docTitle = `${title} (${new Date().toISOString().slice(0, 10)})`;
  const { text: formattedText, styleRequests } = buildGoogleDocContent(title, type, data);

  // 1. Create the blank document in user's Drive
  const createResponse = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: docTitle,
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Google Docs API error (${createResponse.status}): ${errorText}`);
  }

  const createdDoc = await createResponse.json();
  const documentId = createdDoc.documentId;
  if (!documentId) {
    throw new Error("Google Docs API did not return a valid documentId.");
  }

  // 2. Populate the document with formatted structured text
  const updateResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: formattedText,
            },
          },
        ],
      }),
    }
  );

  if (!updateResponse.ok) {
    console.warn("Failed to populate doc content via batchUpdate:", await updateResponse.text());
  } else if (styleRequests.length > 0) {
    // Styled separately so the text is kept even if styling fails
    const styleResponse = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests: styleRequests }),
      }
    );
    if (!styleResponse.ok) {
      console.warn("Failed to style doc content via batchUpdate:", await styleResponse.text());
    }
  }

  // 3. Make document accessible with link if possible for smooth iframe preview
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${documentId}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );
  } catch (permErr) {
    // If domain permissions restrict public sharing, private user ownership applies
    console.warn("Could not set anyone-reader permission:", permErr);
  }

  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
  const embedUrl = `https://docs.google.com/document/d/${documentId}/edit?embedded=true`;

  return {
    documentId,
    documentUrl,
    embedUrl,
  };
}
