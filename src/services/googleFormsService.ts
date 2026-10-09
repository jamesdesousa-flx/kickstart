/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SurveyQuestionItem, SurveyQuestionsData } from "../types/artefacts";

export interface GoogleFormCreationResult {
  formId: string;
  formUrl: string;
  responderUrl: string;
}

// Form item titles and choice values must be a single line
function singleLine(text: string | undefined): string {
  return (text || "").replace(/\s*\n+\s*/g, " ").trim();
}

function uniqueOptions(options: string[] | undefined): { value: string }[] {
  const values = (options || []).map(singleLine).filter(Boolean);
  return Array.from(new Set(values)).map((value) => ({ value }));
}

/**
 * Maps one survey question to a Google Forms question.
 * Choice questions with no options fall back to a text answer, because Forms rejects empty choices.
 */
function buildFormQuestion(q: SurveyQuestionItem): any {
  const required = Boolean(q.required);
  const options = uniqueOptions(q.options);

  switch (q.type) {
    case "single-choice":
    case "multiple-choice":
      if (options.length === 0) return { required, textQuestion: { paragraph: false } };
      return {
        required,
        choiceQuestion: { type: q.type === "single-choice" ? "RADIO" : "CHECKBOX", options },
      };
    case "likert-scale":
      // Labelled Likert options read better as radio buttons than as a bare number scale
      if (options.length >= 2) return { required, choiceQuestion: { type: "RADIO", options } };
      return {
        required,
        scaleQuestion: {
          low: 1,
          high: 5,
          lowLabel: singleLine(q.scaleMinLabel) || "Strongly disagree",
          highLabel: singleLine(q.scaleMaxLabel) || "Strongly agree",
        },
      };
    case "nps":
      return {
        required,
        scaleQuestion: {
          low: 0,
          high: 10,
          lowLabel: singleLine(q.scaleMinLabel) || "Not at all likely",
          highLabel: singleLine(q.scaleMaxLabel) || "Extremely likely",
        },
      };
    case "open-text":
    default:
      return { required, textQuestion: { paragraph: true } };
  }
}

/**
 * Builds the batchUpdate requests that fill the form: description, questions, closing note
 */
export function buildGoogleFormRequests(survey: SurveyQuestionsData): any[] {
  const descriptionParts = [survey.introNote?.trim()];
  if (survey.estimatedMinutes) {
    descriptionParts.push(`Estimated time: ${survey.estimatedMinutes} minutes`);
  }

  const requests: any[] = [
    {
      updateFormInfo: {
        info: { description: descriptionParts.filter(Boolean).join("\n\n") },
        updateMask: "description",
      },
    },
  ];

  const questions = [...(survey.questions || [])]
    .filter((q) => singleLine(q.question))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  questions.forEach((q) => {
    requests.push({
      createItem: {
        item: { title: singleLine(q.question), questionItem: { question: buildFormQuestion(q) } },
        location: { index: requests.length - 1 },
      },
    });
  });

  if (survey.closingNote?.trim()) {
    requests.push({
      createItem: {
        item: { title: "Thank you", description: survey.closingNote.trim(), textItem: {} },
        location: { index: requests.length - 1 },
      },
    });
  }

  return requests;
}

async function formsApiPost(accessToken: string, path: string, body: unknown): Promise<Response> {
  return fetch(`https://forms.googleapis.com/v1/forms${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Creates a real Google Form in the authenticated user's Google Drive via the Google Forms API
 */
export async function createGoogleFormForSurvey(params: {
  title: string;
  data: SurveyQuestionsData;
  accessToken: string;
}): Promise<GoogleFormCreationResult> {
  const { title, data, accessToken } = params;
  const formTitle = singleLine(data.title) || title;

  // 1. Create the empty form. The API only accepts the title here.
  const createResponse = await formsApiPost(accessToken, "", {
    info: {
      title: formTitle,
      documentTitle: `${title} (${new Date().toISOString().slice(0, 10)})`,
    },
  });
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Google Forms API error (${createResponse.status}): ${errorText}`);
  }

  const createdForm = await createResponse.json();
  const formId = createdForm.formId;
  if (!formId) {
    throw new Error("Google Forms API did not return a valid formId.");
  }

  // 2. Add the description, questions and closing note
  const updateResponse = await formsApiPost(accessToken, `/${formId}:batchUpdate`, {
    requests: buildGoogleFormRequests(data),
  });
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Google Forms API error (${updateResponse.status}): ${errorText}`);
  }

  // 3. Publish the form so the responder preview can be embedded and the link can be shared
  try {
    const publishResponse = await formsApiPost(accessToken, `/${formId}:setPublishSettings`, {
      publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
      updateMask: "publishState",
    });
    if (!publishResponse.ok) {
      console.warn("Could not publish Google Form:", await publishResponse.text());
    }
  } catch (publishErr) {
    console.warn("Could not publish Google Form:", publishErr);
  }

  return {
    formId,
    formUrl: `https://docs.google.com/forms/d/${formId}/edit`,
    responderUrl: createdForm.responderUri || `https://docs.google.com/forms/d/${formId}/viewform`,
  };
}
