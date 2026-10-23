/**
 * Resume source resolution for the candidate-analysis SSE route.
 * Pure function so the precedence rule is testable without a DB:
 * explicit upload wins over the position resume bank; neither → null
 * (route answers 400 "upload the candidate resume first").
 */
export interface ResumeSource {
  resumeText: string;
  resumeFileName: string | null;
  origin: "upload" | "bank";
}

export function resolveResumeSource(input: {
  uploadResumeText?: string | null;
  uploadResumeFileName?: string | null;
  bankResumeText?: string | null;
  bankResumeFileName?: string | null;
}): ResumeSource | null {
  const upload = input.uploadResumeText?.trim();
  if (upload) {
    return {
      resumeText: upload,
      resumeFileName: input.uploadResumeFileName ?? null,
      origin: "upload",
    };
  }
  const bank = input.bankResumeText?.trim();
  if (bank) {
    return {
      resumeText: bank,
      resumeFileName: input.bankResumeFileName ?? null,
      origin: "bank",
    };
  }
  return null;
}
