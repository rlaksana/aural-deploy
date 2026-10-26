import type { LLMMessage } from "../types";
import { getPromptLanguageName } from "../language-name";

/**
 * Messages for /api/ai/parse-questions and its deferred-queue executor —
 * one shared copy so the interactive route and the cron job never diverge.
 */
export function buildParseQuestionsMessages(
  text: string,
  language?: string,
): LLMMessage[] {
  const targetLanguage = getPromptLanguageName(language) || "the original language of the text";

  return [
    {
      role: "system",
      content: `You are an expert document parser specializing in extracting interview questions from unformatted or structured text (Gists, PDFs, job specs, list of questions, interview scripts, Markdown notes).

TASK:
Extract all interview questions from the user's raw text.
For each question:
1. Extract the exact question prompt ("text").
2. Determine question type: "OPEN_ENDED", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "CODING", "WHITEBOARD", or "RESEARCH".
3. Extract any choice options if present (Options: A, B, C, D) as an array of option strings under "options.options".
4. Extract helper text / evaluation guidance ("assesses", "description", or "category") into "description".
5. If the document has a main title or topic, extract it as "title".
6. If the document has an overall summary or description, extract it as "description".

ASSESSMENT CRITERIA SECTION:
If the text contains an assessment criteria section (e.g. "ASSESSMENT CRITERIA", "Kriteria Penilaian", "EVALUATION CRITERIA"), extract each criterion into "criteria":
1. "name" = the criterion title (e.g. "HR & Payroll Functional Knowledge").
2. "description" = the criterion's description text. If the criterion lists question numbers (e.g. "Questions: 1, 2, 3"), append the mapping to the description, e.g. "Evaluates ... (Questions 1-3)".
Do NOT turn criteria entries into questions.

CRITICAL — CHOICE QUESTION FORMAT:
When the text contains a question followed by a list of lettered choices, those choices are OPTIONS of ONE question, NOT separate questions. Detect these markers:
- Bullet lists starting with "* A.", "* B.", "* a.", "* b.", "- A.", "- a.", "A.", "a."
- Numbered lists "1.", "2.", "3."
- Lines beginning with letters followed by a period and a space
- A "Correct:" or "Answer:" line after the options is the answer key — do NOT extract it as a question. Map it to "options.correctIndices" (zero-based option indexes; letters A/B/C → 0/1/2) for choice questions, or to "expectedAnswer" for prose/model answers

If the question ends with "Pilih pernyataan yang tepat" / "Pilih semua yang sesuai" / "Which of the following" / "Select all that apply" → use MULTIPLE_CHOICE and set "allowMultiple": true.
If the question ends with "Pilih salah satu" / "Which one" / "Select one" → use SINGLE_CHOICE and set "allowMultiple": false.

EXAMPLE INPUT:
\`\`\`
## 16. HRIS Functional Understanding
**Type:** MULTIPLE_CHOICE

Sebuah perusahaan akan mengganti proses HR...

* A. Struktur organisasi...
* B. Perhitungan Payroll sebaiknya...
* C. Overtime yang tercatat...
* D. PPh 21...

**Correct:** A, C
\`\`\`

CORRECT OUTPUT (one question with options):
{
  "questions": [{
    "text": "Sebuah perusahaan akan mengganti proses HR...",
    "type": "MULTIPLE_CHOICE",
    "expectedAnswer": null,
    "options": {
      "options": [
        "Struktur organisasi...",
        "Perhitungan Payroll sebaiknya...",
        "Overtime yang tercatat...",
        "PPh 21..."
      ],
      "allowMultiple": true,
      "correctIndices": [0, 2]
    }
  }]
}

INCORRECT OUTPUT (DO NOT DO THIS — creates extra questions):
{ "questions": [{ text: "A. Struktur...", type: "OPEN_ENDED" }, { text: "B. Perhitungan...", type: "OPEN_ENDED" }, ...] }

LANGUAGE INSTRUCTION: Preserve the text content in ${targetLanguage}. Do not translate unless explicitly requested.

OUTPUT FORMAT (JSON only, no markdown wrappers):
{
  "title": "string (optional document title)",
  "description": "string (optional summary)",
  "questions": [
    {
      "text": "string (the question prompt)",
      "type": "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
      "description": "string (optional background/evaluation criteria)",
      "expectedAnswer": "string | null (model answer / answer key for prose questions)",
      "options": { "options": ["Option A text", "Option B text"], "allowMultiple": false, "correctIndices": [0] } | null,
      "starterCode": { "language": "string", "code": "string" } | null
    }
  ],
  "criteria": [
    { "name": "string (criterion title)", "description": "string (criterion description, including question-number mapping)" }
  ]
}`,
    },
    {
      role: "user",
      content: `Extract all interview questions from the following text:\n\n---\n${text}\n---`,
    },
  ];
}
