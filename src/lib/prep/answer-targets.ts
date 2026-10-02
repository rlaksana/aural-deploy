import {
    inferSuggestedAnswerStructure,
    structureTagLabel,
    type PrepStructureLabel,
} from "@/lib/prep/answer-rubric";

/** What a strong answer to this question should aim for. */
export type AnswerTarget = {
  structure: PrepStructureLabel;
  structureLabel: string;
  structureHint: string;
  /** Signals the coach expects to hear in a strong answer. */
  signals: string[];
  /** Suggested spoken length, e.g. "60–90s". */
  lengthLabel: string;
  /** Suggested word budget, e.g. "80–110 words". */
  wordsLabel: string;
};

type TargetPreset = {
  signals: { en: string[]; id: string[] };
  lengthLabel: string;
  wordsLabel: { en: string; id: string };
};

const TARGET_PRESETS: Record<PrepStructureLabel, TargetPreset> = {
  Intro: {
    signals: {
      en: ["Who you are", "Why this role", "One proof point"],
      id: ["Siapa kamu", "Kenapa posisi ini", "Satu bukti konkret"],
    },
    lengthLabel: "60–90s",
    wordsLabel: { en: "80–110 words", id: "80–110 kata" },
  },
  STAR: {
    signals: {
      en: ["Specific situation", "Your actions", "Measurable result"],
      id: ["Situasi spesifik", "Tindakanmu", "Hasil terukur"],
    },
    lengthLabel: "90–120s",
    wordsLabel: { en: "120–160 words", id: "120–160 kata" },
  },
  PAR: {
    signals: {
      en: ["Problem framing", "Approach & trade-offs", "Outcome"],
      id: ["Rumusan masalah", "Pendekatan & pertimbangan", "Hasil"],
    },
    lengthLabel: "90–150s",
    wordsLabel: { en: "120–180 words", id: "120–180 kata" },
  },
  Technical: {
    signals: {
      en: ["Problem framing", "Approach & trade-offs", "Outcome"],
      id: ["Rumusan masalah", "Pendekatan & pertimbangan", "Hasil"],
    },
    lengthLabel: "90–150s",
    wordsLabel: { en: "120–180 words", id: "120–180 kata" },
  },
  Service: {
    signals: {
      en: ["Empathy", "Need probe", "Clear next step"],
      id: ["Empati", "Gali kebutuhan", "Langkah lanjut yang jelas"],
    },
    lengthLabel: "60–90s",
    wordsLabel: { en: "80–120 words", id: "80–120 kata" },
  },
  Knowledge: {
    signals: {
      en: ["Key categories", "Features", "Best-fit customer"],
      id: ["Kategori utama", "Fitur", "Pelanggan paling cocok"],
    },
    lengthLabel: "60–90s",
    wordsLabel: { en: "80–120 words", id: "80–120 kata" },
  },
  Choice: {
    signals: {
      en: ["Selected option", "Reason", "Trade-off"],
      id: ["Opsi yang dipilih", "Alasan", "Pertimbangan"],
    },
    lengthLabel: "30–60s",
    wordsLabel: { en: "50–80 words", id: "50–80 kata" },
  },
  WrapUp: {
    signals: {
      en: ["Extra signal", "Role fit", "Concise close"],
      id: ["Sinyal tambahan", "Kesesuaian peran", "Penutup singkat"],
    },
    lengthLabel: "30–60s",
    wordsLabel: { en: "50–80 words", id: "50–80 kata" },
  },
};

const isId = (language?: string) => !!language && language.toLowerCase().startsWith("id");

/** Heuristic answer target for a question (structure, expected signals, length). */
export function buildAnswerTarget(
  questionType: string | null | undefined,
  questionText: string,
  language?: string,
): AnswerTarget {
  const id = isId(language);
  const structure = inferSuggestedAnswerStructure(questionType, questionText);
  const { label, hint } = structureTagLabel(structure, language);
  const preset = TARGET_PRESETS[structure] ?? TARGET_PRESETS.STAR;
  return {
    structure,
    structureLabel: label,
    structureHint: hint,
    signals: id ? preset.signals.id : preset.signals.en,
    lengthLabel: preset.lengthLabel,
    wordsLabel: id ? preset.wordsLabel.id : preset.wordsLabel.en,
  };
}
