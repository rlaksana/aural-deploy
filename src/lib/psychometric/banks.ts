/**
 * Psychometric instrument banks. Items are plain SINGLE_CHOICE questions —
 * they ride the existing deterministic session flow unchanged; only scoring
 * (scoring.ts) is new.
 *
 * These are rule-based screening instruments with band interpretation, NOT
 * clinical norms. The UI states this explicitly. DISC is approximated via
 * agreement-rated statements rather than forced-choice — also disclosed.
 */

export type PsychometricBankId = "BIG_FIVE" | "DISC" | "REASONING";

export type PsychometricDimension = {
  key: string;
  label: string;
  description: string;
};

export type PsychometricItem = {
  text: string;
  /** Dimension key this item feeds. */
  dimension: string;
  options: string[];
  /** Keyed items (reasoning): index of the correct option. */
  correctIndex?: number;
  /** Likert items worded negatively — the score is inverted. */
  reverse?: boolean;
};

export type PsychometricBank = {
  id: PsychometricBankId;
  name: string;
  description: string;
  /** Likert banks score agreement (0-4 scaled); keyed banks score right/wrong. */
  keyed: boolean;
  dimensions: PsychometricDimension[];
  items: PsychometricItem[];
};

export const LIKERT_OPTIONS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];

const BIG_FIVE_DIMENSIONS: PsychometricDimension[] = [
  {
    key: "OPENNESS",
    label: "Openness",
    description: "Curiosity, imagination, and openness to new experiences",
  },
  {
    key: "CONSCIENTIOUSNESS",
    label: "Conscientiousness",
    description: "Organization, reliability, and self-discipline",
  },
  {
    key: "EXTRAVERSION",
    label: "Extraversion",
    description: "Sociability, energy, and assertiveness in social settings",
  },
  {
    key: "AGREEABLENESS",
    label: "Agreeableness",
    description: "Cooperation, empathy, and concern for others",
  },
  {
    key: "STABILITY",
    label: "Emotional Stability",
    description: "Calmness and resilience under stress (low neuroticism)",
  },
];

const BIG_FIVE_ITEMS: PsychometricItem[] = [
  // Openness (6)
  { text: "I am quick to try new tools, methods, or ideas.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "I enjoy solving problems that have no obvious answer.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "Abstract or theoretical discussions interest me.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "I prefer routines over experimenting with new approaches.", dimension: "OPENNESS", options: LIKERT_OPTIONS, reverse: true },
  { text: "I often notice connections between unrelated ideas.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  { text: "Change excites me more than it unsettles me.", dimension: "OPENNESS", options: LIKERT_OPTIONS },
  // Conscientiousness (6)
  { text: "I finish what I start, even when it becomes tedious.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "I keep my work organized and easy for others to follow.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "I rarely miss deadlines I commit to.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "I often improvise instead of planning ahead.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS, reverse: true },
  { text: "I double-check my work before submitting it.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  { text: "Others can rely on me without reminders.", dimension: "CONSCIENTIOUSNESS", options: LIKERT_OPTIONS },
  // Extraversion (6)
  { text: "I feel energized after spending time with a group.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  { text: "I comfortably start conversations with strangers.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  { text: "I prefer to work alone rather than in a team.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS, reverse: true },
  { text: "I speak up readily in group discussions.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  { text: "Long social events leave me drained quickly.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS, reverse: true },
  { text: "I enjoy presenting my work to an audience.", dimension: "EXTRAVERSION", options: LIKERT_OPTIONS },
  // Agreeableness (6)
  { text: "I try to see the other person's side before disagreeing.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "Helping colleagues is worth the interruption.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "I find it easy to criticize people directly.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS, reverse: true },
  { text: "I go out of my way to keep relationships harmonious.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "Most people can be trusted to do the right thing.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS },
  { text: "I would rather win an argument than preserve the relationship.", dimension: "AGREEABLENESS", options: LIKERT_OPTIONS, reverse: true },
  // Emotional Stability (6)
  { text: "I stay calm when plans change at the last minute.", dimension: "STABILITY", options: LIKERT_OPTIONS },
  { text: "I rarely worry about things outside my control.", dimension: "STABILITY", options: LIKERT_OPTIONS },
  { text: "Small setbacks can ruin my whole day.", dimension: "STABILITY", options: LIKERT_OPTIONS, reverse: true },
  { text: "Under pressure, I think more clearly, not less.", dimension: "STABILITY", options: LIKERT_OPTIONS },
  { text: "I often feel anxious without a clear reason.", dimension: "STABILITY", options: LIKERT_OPTIONS, reverse: true },
  { text: "Criticism bounces off me quickly.", dimension: "STABILITY", options: LIKERT_OPTIONS },
];

const DISC_DIMENSIONS: PsychometricDimension[] = [
  {
    key: "DOMINANCE",
    label: "Dominance (D)",
    description: "Direct, results-driven, comfortable taking charge",
  },
  {
    key: "INFLUENCE",
    label: "Influence (I)",
    description: "Enthusiastic, persuasive, energized by people",
  },
  {
    key: "STEADINESS",
    label: "Steadiness (S)",
    description: "Patient, dependable, values stability and harmony",
  },
  {
    key: "COMPLIANCE",
    label: "Conscientiousness (C)",
    description: "Precise, analytical, values accuracy and quality",
  },
];

const DISC_ITEMS: PsychometricItem[] = [
  // Dominance (6)
  { text: "When a group lacks direction, I naturally take the lead.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "I would rather make a fast decision than a perfect one.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "I enjoy negotiating tough positions.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "I avoid conflict even when I know I am right.", dimension: "DOMINANCE", options: LIKERT_OPTIONS, reverse: true },
  { text: "Being given authority motivates me.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  { text: "I challenge decisions I disagree with, regardless of who made them.", dimension: "DOMINANCE", options: LIKERT_OPTIONS },
  // Influence (6)
  { text: "I can get most people excited about an idea.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "I think out loud and enjoy group brainstorming.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Working alone for long stretches drains me.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "I persuade best with stories and enthusiasm, not data.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "Strangers feel like friends I have not met yet.", dimension: "INFLUENCE", options: LIKERT_OPTIONS },
  { text: "I avoid being the center of attention.", dimension: "INFLUENCE", options: LIKERT_OPTIONS, reverse: true },
  // Steadiness (6)
  { text: "I prefer familiar processes over constant change.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Colleagues describe me as patient and a good listener.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "I stay loyal to a team even in hard times.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "Sudden priority changes stress me more than most.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "I take time to make others feel included.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  { text: "I would rather maintain a system than overhaul it.", dimension: "STEADINESS", options: LIKERT_OPTIONS },
  // Compliance (6)
  { text: "I check details others consider minor.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "Clear rules make me more effective, not less.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "I verify facts before repeating them.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "Close enough is not good enough for my work.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
  { text: "I am comfortable making decisions with incomplete data.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS, reverse: true },
  { text: "Precision matters more to me than speed.", dimension: "COMPLIANCE", options: LIKERT_OPTIONS },
];

const REASONING_DIMENSIONS: PsychometricDimension[] = [
  {
    key: "NUMERICAL",
    label: "Numerical Reasoning",
    description: "Working with numbers, rates, and percentages",
  },
  {
    key: "LOGICAL",
    label: "Logical Reasoning",
    description: "Patterns, sequences, and deductive rules",
  },
  {
    key: "VERBAL",
    label: "Verbal Reasoning",
    description: "Word meaning, relationships, and comprehension",
  },
];

const REASONING_ITEMS: PsychometricItem[] = [
  // Numerical (5)
  {
    text: "A shirt costs $40 and is discounted by 25%. What is the new price?",
    dimension: "NUMERICAL",
    options: ["$25", "$30", "$32", "$35"],
    correctIndex: 1,
  },
  {
    text: "If 3 machines produce 90 units in an hour, how many units do 5 machines produce in an hour at the same rate?",
    dimension: "NUMERICAL",
    options: ["120", "135", "150", "180"],
    correctIndex: 2,
  },
  {
    text: "A price rises from $80 to $100. What is the percentage increase?",
    dimension: "NUMERICAL",
    options: ["20%", "25%", "30%", "80%"],
    correctIndex: 1,
  },
  {
    text: "What is the average of 7, 11, 15, and 23?",
    dimension: "NUMERICAL",
    options: ["13", "14", "15", "16"],
    correctIndex: 1,
  },
  {
    text: "If a train travels 240 km in 3 hours, how far does it travel in 5 hours at the same speed?",
    dimension: "NUMERICAL",
    options: ["360 km", "400 km", "420 km", "480 km"],
    correctIndex: 1,
  },
  // Logical (5)
  {
    text: "What comes next in the sequence? 2, 4, 8, 16, ...",
    dimension: "LOGICAL",
    options: ["20", "24", "32", "64"],
    correctIndex: 2,
  },
  {
    text: "All bloops are razzies. All razzies are lazzies. Which statement is definitely true?",
    dimension: "LOGICAL",
    options: [
      "All bloops are lazzies",
      "All lazzies are bloops",
      "Some razzies are bloops only",
      "No lazzies are bloops",
    ],
    correctIndex: 0,
  },
  {
    text: "If A > B and B > C, which must be true?",
    dimension: "LOGICAL",
    options: ["A > C", "C > A", "A = C", "Cannot be determined"],
    correctIndex: 0,
  },
  {
    text: "What comes next? 1, 1, 2, 3, 5, 8, ...",
    dimension: "LOGICAL",
    options: ["11", "12", "13", "15"],
    correctIndex: 2,
  },
  {
    text: "Every exam in this school is oral. History is an exam in this school. Therefore:",
    dimension: "LOGICAL",
    options: [
      "History is oral",
      "History is written",
      "Some exams are written",
      "No conclusion is possible",
    ],
    correctIndex: 0,
  },
  // Verbal (5)
  {
    text: "Which word is most similar in meaning to DILIGENT?",
    dimension: "VERBAL",
    options: ["Careless", "Hardworking", "Talkative", "Slow"],
    correctIndex: 1,
  },
  {
    text: "Which word means the opposite of SCARCE?",
    dimension: "VERBAL",
    options: ["Rare", "Plentiful", "Costly", "Hidden"],
    correctIndex: 1,
  },
  {
    text: "FINGER is to HAND as TOE is to ...",
    dimension: "VERBAL",
    options: ["Nail", "Shoe", "FOOT", "Leg"],
    correctIndex: 2,
  },
  {
    text: "Choose the word that best completes: The evidence was _____, so the case was dismissed.",
    dimension: "VERBAL",
    options: ["compelling", "insufficient", "admissible", "recent"],
    correctIndex: 1,
  },
  {
    text: "Which word does NOT belong with the others?",
    dimension: "VERBAL",
    options: ["Triangle", "Square", "Circle", "Pentagon"],
    correctIndex: 2,
  },
];

export const PSYCHOMETRIC_BANKS: Record<PsychometricBankId, PsychometricBank> = {
  BIG_FIVE: {
    id: "BIG_FIVE",
    name: "Big Five Personality (BFI-style)",
    description:
      "30 agreement-rated statements across Openness, Conscientiousness, Extraversion, Agreeableness, and Emotional Stability.",
    keyed: false,
    dimensions: BIG_FIVE_DIMENSIONS,
    items: BIG_FIVE_ITEMS,
  },
  DISC: {
    id: "DISC",
    name: "DISC Work Style Profile",
    description:
      "24 agreement-rated statements approximating Dominance, Influence, Steadiness, and Conscientiousness.",
    keyed: false,
    dimensions: DISC_DIMENSIONS,
    items: DISC_ITEMS,
  },
  REASONING: {
    id: "REASONING",
    name: "Reasoning Test (Numerical · Logical · Verbal)",
    description:
      "15 keyed questions covering numerical, logical, and verbal reasoning.",
    keyed: true,
    dimensions: REASONING_DIMENSIONS,
    items: REASONING_ITEMS,
  },
};

export function getPsychometricBank(id: unknown): PsychometricBank | null {
  if (typeof id !== "string") return null;
  return (PSYCHOMETRIC_BANKS as Record<string, PsychometricBank>)[id] ?? null;
}
