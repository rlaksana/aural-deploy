"use client";

import { bt, getLanguageKey, type LangKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
    Code2,
    MessageSquare,
    Mic,
    MicOff,
    PenLine,
    PhoneOff,
    SkipBack,
    SkipForward,
    Volume2,
} from "lucide-react";

interface GuideItem {
  title: string;
  description: string;
  illustration: React.ReactNode;
}

function VoiceAreaIllustration({ lang = "en" }: { lang?: LangKey }) {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Volume2 className="h-5 w-5 animate-pulse" />
          <span className="text-xs font-medium">
            {bt(lang, { en: "AI is speaking...", zh: "AI is speaking...", id: "AI sedang berbicara..." })}
          </span>
        </div>
        <div className="flex items-center gap-[2px]">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-primary/60"
              style={{ height: `${6 + (i % 3) * 8}px` }}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {bt(lang, {
            en: "Speak naturally — AI responds automatically",
            zh: "Speak naturally — AI responds automatically",
            id: "Bicara secara natural — AI merespons otomatis",
          })}
        </span>
      </div>
    </div>
  );
}

function MicControlIllustration({ lang = "en" }: { lang?: LangKey }) {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-500 text-white">
            <Mic className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium text-secondary-600">
            {bt(lang, { en: "Unmuted", zh: "Unmuted", id: "Mikrofon aktif" })}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">→</div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MicOff className="h-4 w-4" />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {bt(lang, { en: "Muted", zh: "Muted", id: "Mikrofon di-mute" })}
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatChannelIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-medium">Chat</span>
        </div>
        <div className="w-36 rounded-lg border bg-card p-2">
          <div className="mb-1 text-[9px] font-medium text-muted-foreground">Chat Panel</div>
          <div className="space-y-1">
            <div className="rounded bg-muted px-1.5 py-0.5 text-[8px]">Type messages here...</div>
            <div className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] text-primary">AI responds in text</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolsIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <PenLine className="h-4 w-4" />
          </div>
          <span className="text-[10px]">Whiteboard</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
            <Code2 className="h-4 w-4" />
          </div>
          <span className="whitespace-nowrap text-[10px]">Code Editor</span>
        </div>
        <div className="ml-2 w-28 rounded border bg-card p-1.5">
          <div className="mb-1 h-1 w-12 rounded bg-muted-foreground/20" />
          <div className="space-y-0.5">
            <div className="h-1 w-full rounded bg-muted-foreground/10" />
            <div className="h-1 w-20 rounded bg-muted-foreground/10" />
            <div className="h-1 w-24 rounded bg-muted-foreground/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TranscriptIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 rounded-lg border bg-card p-2.5">
        <div className="mb-2 text-[9px] font-semibold text-muted-foreground">Transcript</div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-1">
            <Volume2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-primary" />
            <div className="text-[8px]"><span className="font-medium text-primary">AI:</span> Tell me about yourself</div>
          </div>
          <div className="flex items-start gap-1">
            <Mic className="mt-0.5 h-2.5 w-2.5 shrink-0 text-secondary-500" />
            <div className="text-[8px]"><span className="font-medium text-secondary-600">You:</span> I have 5 years of...</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <SkipBack className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">Previous</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <SkipForward className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">Next</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <PhoneOff className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px]">End</span>
        </div>
        <div className="ml-2 flex flex-col gap-1">
          <div className="h-1.5 w-20 rounded-full bg-muted">
            <div className="h-full w-8 rounded-full bg-primary" />
          </div>
          <span className="text-[9px] text-muted-foreground">Q1 / 5</span>
        </div>
      </div>
    </div>
  );
}

function ChatQuestionIllustration() {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 space-y-1.5">
        <div className="rounded-2xl bg-muted px-3 py-2 text-[9px]">
          Tell me about a time when you had to solve a complex problem.
        </div>
        <div className="ml-auto w-36 rounded-2xl bg-primary px-3 py-2 text-[9px] text-primary-foreground">
          In my previous role, I...
        </div>
        <div className="flex items-center gap-1">
          <div className="h-0.5 w-0.5 animate-bounce rounded-full bg-muted-foreground/50" />
          <div className="h-0.5 w-0.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <div className="h-0.5 w-0.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function ChatInputIllustration({ lang = "en" }: { lang?: LangKey }) {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-52 rounded-lg border bg-card p-2">
        <div className="flex items-end gap-1.5">
          <div className="flex-1 rounded-md border bg-background px-2 py-1.5 text-[9px] text-muted-foreground">
            Type your response...
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
          </div>
        </div>
        <div className="mt-1.5 text-[8px] text-muted-foreground">
          {bt(lang, { en: "Press Enter to send", zh: "Press Enter to send", id: "Tekan Enter untuk mengirim" })}
        </div>
      </div>
    </div>
  );
}

function ChatProgressIllustration({ lang = "en" }: { lang?: LangKey }) {
  return (
    <div className="flex h-32 w-full items-center justify-center rounded-lg border bg-muted/30 p-3">
      <div className="w-48 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium">
            {bt(lang, { en: "Interview Progress", zh: "Interview Progress", id: "Progres Wawancara" })}
          </span>
          <span className="rounded border px-1.5 py-0.5 text-[9px] font-medium">Q2/5</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div className="h-full w-2/5 rounded-full bg-primary transition-all" />
        </div>
        <div className="text-[8px] text-muted-foreground">40% complete</div>
      </div>
    </div>
  );
}

export function getVoiceGuideItems(language?: string): GuideItem[] {
  const lang = getLanguageKey(language);
  return [
    {
      title: bt(lang, { en: "Your AI Interviewer", zh: "Your AI Interviewer", id: "Pewawancara AI-mu" }),
      description: bt(lang, {
        en: "The center area shows the AI interviewer status. It speaks to you and listens to your responses in real time.",
        zh: "The center area shows the AI interviewer status. It speaks to you and listens to your responses in real time.",
        id: "Bagian tengah menampilkan status pewawancara AI. Ia berbicara dan mendengarkan jawabanmu secara real time.",
      }),
      illustration: <VoiceAreaIllustration lang={lang} />,
    },
    {
      title: bt(lang, { en: "Microphone Control", zh: "Microphone Control", id: "Kontrol Mikrofon" }),
      description: bt(lang, {
        en: "Click the mic button to mute or unmute. Speak naturally when unmuted — the AI will respond automatically.",
        zh: "Click the mic button to mute or unmute. Speak naturally when unmuted — the AI will respond automatically.",
        id: "Klik tombol mikrofon untuk mute atau unmute. Bicara secara natural saat mikrofon aktif — AI akan merespons otomatis.",
      }),
      illustration: <MicControlIllustration lang={lang} />,
    },
    {
      title: bt(lang, { en: "Text Chat Channel", zh: "Text Chat Channel", id: "Saluran Obrolan Teks" }),
      description: bt(lang, {
        en: "Prefer typing? Toggle the chat panel to send text messages alongside the voice conversation.",
        zh: "Prefer typing? Toggle the chat panel to send text messages alongside the voice conversation.",
        id: "Lebih suka mengetik? Buka panel obrolan untuk mengirim pesan teks bersama percakapan suara.",
      }),
      illustration: <ChatChannelIllustration />,
    },
    {
      title: bt(lang, { en: "Whiteboard & Code Editor", zh: "Whiteboard & Code Editor", id: "Whiteboard & Editor Kode" }),
      description: bt(lang, {
        en: "Use the Whiteboard for diagrams or the Code Editor for coding questions. They open as side panels.",
        zh: "Use the Whiteboard for diagrams or the Code Editor for coding questions. They open as side panels.",
        id: "Gunakan Whiteboard untuk diagram atau Editor Kode untuk soal coding. Keduanya terbuka sebagai panel samping.",
      }),
      illustration: <ToolsIllustration />,
    },
    {
      title: bt(lang, { en: "Conversation Transcript", zh: "Conversation Transcript", id: "Transkrip Percakapan" }),
      description: bt(lang, {
        en: "Your full conversation transcript appears on the right. Use it to review what was said.",
        zh: "Your full conversation transcript appears on the right. Use it to review what was said.",
        id: "Transkrip lengkap percakapanmu tampil di sisi kanan. Gunakan untuk meninjau apa yang sudah dibicarakan.",
      }),
      illustration: <TranscriptIllustration />,
    },
    {
      title: bt(lang, { en: "Question Navigation", zh: "Question Navigation", id: "Navigasi Pertanyaan" }),
      description: bt(lang, {
        en: "Use Previous/Next to navigate between questions. The progress bar shows how far along you are. Click End when finished.",
        zh: "Use Previous/Next to navigate between questions. The progress bar shows how far along you are. Click End when finished.",
        id: "Gunakan Sebelumnya/Berikutnya untuk berpindah antar pertanyaan. Bilah progres menunjukkan sejauh mana kamu. Klik Selesai jika sudah selesai.",
      }),
      illustration: <NavigationIllustration />,
    },
  ];
}

export function getChatGuideItems(language?: string): GuideItem[] {
  const lang = getLanguageKey(language);
  return [
    {
      title: bt(lang, { en: "Chat with the AI", zh: "Chat with the AI", id: "Obrolan dengan AI" }),
      description: bt(lang, {
        en: "Questions appear as chat messages. The AI will guide you through each one and may ask follow-ups based on your answers.",
        zh: "Questions appear as chat messages. The AI will guide you through each one and may ask follow-ups based on your answers.",
        id: "Pertanyaan muncul sebagai pesan obrolan. AI akan memandumu melewati setiap pertanyaan dan mungkin bertanya lanjut berdasarkan jawabanmu.",
      }),
      illustration: <ChatQuestionIllustration />,
    },
    {
      title: bt(lang, { en: "Type Your Response", zh: "Type Your Response", id: "Tulis Jawabanmu" }),
      description: bt(lang, {
        en: "Type your answer in the text box and press Enter or click Send. Take your time to compose thoughtful responses.",
        zh: "Type your answer in the text box and press Enter or click Send. Take your time to compose thoughtful responses.",
        id: "Ketik jawabanmu di kotak teks lalu tekan Enter atau klik Kirim. Luangkan waktumu untuk menyusun jawaban yang matang.",
      }),
      illustration: <ChatInputIllustration lang={lang} />,
    },
    {
      title: bt(lang, { en: "Whiteboard & Code Editor", zh: "Whiteboard & Code Editor", id: "Whiteboard & Editor Kode" }),
      description: bt(lang, {
        en: "Use the Whiteboard for diagrams or the Code Editor for coding questions. They appear above the chat area.",
        zh: "Use the Whiteboard for diagrams or the Code Editor for coding questions. They appear above the chat area.",
        id: "Gunakan Whiteboard untuk diagram atau Editor Kode untuk soal coding. Keduanya tampil di atas area obrolan.",
      }),
      illustration: <ToolsIllustration />,
    },
    {
      title: bt(lang, { en: "Track Your Progress", zh: "Track Your Progress", id: "Pantau Progresmu" }),
      description: bt(lang, {
        en: "The progress bar and question counter show how far along you are. Use the back arrow to revisit previous questions.",
        zh: "The progress bar and question counter show how far along you are. Use the back arrow to revisit previous questions.",
        id: "Bilah progres dan penghitung pertanyaan menunjukkan sejauh mana kamu. Gunakan panah kembali untuk membuka pertanyaan sebelumnya.",
      }),
      illustration: <ChatProgressIllustration lang={lang} />,
    },
  ];
}

const STEP_ILLUSTRATION_MAP: Record<string, (lang: LangKey) => React.ReactNode> = {
  "voice-status": (lang) => <VoiceAreaIllustration lang={lang} />,
  "voice-mic": (lang) => <MicControlIllustration lang={lang} />,
  "voice-chat": () => <ChatChannelIllustration />,
  "voice-tools": () => <ToolsIllustration />,
  "voice-transcript": () => <TranscriptIllustration />,
  "voice-progress": () => <NavigationIllustration />,
  "chat-question": () => <ChatQuestionIllustration />,
  "chat-input": (lang) => <ChatInputIllustration lang={lang} />,
  "chat-tools": () => <ToolsIllustration />,
  "chat-progress": (lang) => <ChatProgressIllustration lang={lang} />,
  "chat-timer": () => <NavigationIllustration />,
};

export function getStepIllustration(stepId: string, language?: string): React.ReactNode | null {
  const render = STEP_ILLUSTRATION_MAP[stepId];
  return render ? render(getLanguageKey(language)) : null;
}

export function GuideStepCard({
  item,
  index,
  compact = false,
}: {
  item: GuideItem;
  index: number;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "overflow-hidden rounded-lg",
      compact ? "border bg-card p-3" : "p-0",
    )}>
      {!compact && item.illustration}
      <div className={cn("flex items-start gap-3", !compact && "mt-3")}>
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold",
          compact ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-xs",
        )}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
            {item.title}
          </p>
          <p className={cn(
            "mt-0.5 leading-relaxed text-muted-foreground",
            compact ? "text-[11px]" : "text-xs",
          )}>
            {item.description}
          </p>
        </div>
      </div>
    </div>
  );
}
