/**
 * Client-side resume parsing against the SSE /api/ai/parse-resume route.
 * Shared by the interview candidate import dialog and the position resume bank.
 */
export interface ParsedCandidate {
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  education?: string;
  school?: string;
  major?: string;
  graduationYear?: number;
  workExperience?: string;
  notes?: string;
}

export async function parseOneResume(
  file: File,
  onStream: (text: string) => void,
  organizationId?: string,
  interviewId?: string,
): Promise<ParsedCandidate> {
  const formData = new FormData();
  formData.append("file", file);
  if (organizationId) formData.append("organizationId", organizationId);
  if (interviewId) formData.append("interviewId", interviewId);

  const res = await fetch("/api/ai/parse-resume", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error || "Failed to parse resume");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;

      try {
        const { token, error } = JSON.parse(payload);
        if (error) throw new Error(error);
        if (token) {
          accumulated += token;
          onStream(accumulated);
        }
      } catch {
        // skip malformed SSE
      }
    }
  }

  const cleaned = accumulated
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  return JSON.parse(cleaned) as ParsedCandidate;
}
