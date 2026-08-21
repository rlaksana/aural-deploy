export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh", label: "Chinese (中文)" },
  { value: "id", label: "Indonesian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
] as const;

export const AI_TONES = [
  { value: "CASUAL", label: "Casual" },
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "FORMAL", label: "Formal" },
  { value: "FRIENDLY", label: "Friendly" },
] as const;

export const FOLLOW_UP_DEPTHS = [
  { value: "LIGHT", label: "Light", description: "no follow-up (open-ended only)" },
  { value: "MODERATE", label: "Moderate", description: "1-2 follow-ups (open-ended only)" },
  { value: "DEEP", label: "Deep", description: "3-5 follow-ups (open-ended only)" },
] as const;
