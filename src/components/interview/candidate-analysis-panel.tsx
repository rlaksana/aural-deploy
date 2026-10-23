"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { scoreColor } from "@/components/interview/report-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { CandidateAnalysis } from "@/lib/ai/candidate-analysis-schema";
import {
  Check,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

type SectionKey = "resumeFit" | "interviewFit" | "overall";

const SECTION_KEYS: SectionKey[] = ["resumeFit", "interviewFit", "overall"];

type SectionState = "idle" | "started" | "done";

interface StagedResume {
  text: string;
  fileName?: string;
}

// analysis.getSessionSummary types the stored row as the z-inferred shape;
// jdSource rides along at runtime (StoredCandidateAnalysis) but stays optional here.
export type PanelCandidateAnalysis = CandidateAnalysis & {
  jdSource?: "jobDescription" | "fallback";
};

export function CandidateAnalysisPanel({
  sessionId,
  resumeText,
  resumeFileName,
  candidateAnalysis,
  onSaved,
}: {
  sessionId: string;
  resumeText?: string | null;
  resumeFileName?: string | null;
  candidateAnalysis?: PanelCandidateAnalysis | null;
  onSaved: () => void;
}) {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedResume | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>({
    resumeFit: "idle",
    interviewFit: "idle",
    overall: "idle",
  });
  const [error, setError] = useState("");

  const hasResume = !!(staged || resumeText || resumeFileName);
  const chipName = staged
    ? (staged.fileName ?? t("positions.pasteResume"))
    : (resumeFileName ?? t("positions.pasteResume"));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setExtracting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/extract-text", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setStaged({ text: data.text as string, fileName: file.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      toast({ title: message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const runAnalysis = async () => {
    if (generating) return;
    setGenerating(true);
    setError("");
    setSections({ resumeFit: "idle", interviewFit: "idle", overall: "idle" });
    try {
      const res = await fetch("/api/ai/candidate-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          resumeText: staged?.text ?? resumeText ?? undefined,
          resumeFileName: staged?.fileName ?? resumeFileName ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Analysis failed");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "section") {
            setSections((prev) => ({
              ...prev,
              [payload.key as SectionKey]: payload.status as SectionState,
            }));
          } else if (payload.type === "done") {
            done = true;
          } else if (payload.type === "error") {
            throw new Error(payload.message || "Analysis failed");
          }
        }
      }
      if (!done) throw new Error("No result received");
      onSaved();
      toast({ title: t("positions.candidateAnalysis.title"), description: t("positions.candidateAnalysis.done") });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      setError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const renderSectionCard = (
    title: string,
    section: { score: number; summary: string; strengths: string[]; gaps: string[] },
  ) => (
    <div key={title} className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium">{title}</p>
        <span className={`shrink-0 text-lg font-bold ${scoreColor(section.score)}`}>
          {section.score}/10
        </span>
      </div>
      <Progress value={section.score * 10} className="h-2" />
      <p className="whitespace-pre-line text-sm leading-relaxed">{section.summary}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-secondary-600 dark:text-secondary-400">
            {t("positions.candidateAnalysis.strengths")}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {section.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-tertiary-600 dark:text-tertiary-300">
            {t("positions.candidateAnalysis.gaps")}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {section.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const verdictBadge = (verdict: string) =>
    verdict === "STRONG_HIRE" || verdict === "HIRE" ? (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
        {verdict}
      </Badge>
    ) : verdict === "CONDITIONAL" ? (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        {verdict}
      </Badge>
    ) : (
      <Badge variant="destructive">{verdict}</Badge>
    );

  const sectionLabels: Record<SectionKey, string> = {
    resumeFit: t("positions.candidateAnalysis.resumeFitTitle"),
    interviewFit: t("positions.candidateAnalysis.interviewFitTitle"),
    overall: t("positions.candidateAnalysis.overallTitle"),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t("positions.candidateAnalysis.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {candidateAnalysis?.jdSource === "fallback" && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("positions.candidateAnalysis.jdFallbackNote")}
          </p>
        )}

        {candidateAnalysis && (
          <div className="space-y-4">
            {renderSectionCard(
              t("positions.candidateAnalysis.resumeFitTitle"),
              candidateAnalysis.resumeFit,
            )}
            {renderSectionCard(
              t("positions.candidateAnalysis.interviewFitTitle"),
              candidateAnalysis.interviewFit,
            )}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {t("positions.candidateAnalysis.overallTitle")}
                  </p>
                  {verdictBadge(candidateAnalysis.overall.verdict)}
                </div>
                <span className={`text-lg font-bold ${scoreColor(candidateAnalysis.overall.score)}`}>
                  {candidateAnalysis.overall.score}/10
                </span>
              </div>
              <Progress value={candidateAnalysis.overall.score * 10} className="h-2" />
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {candidateAnalysis.overall.summary}
              </p>
              <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">
                {candidateAnalysis.overall.recommendation}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-secondary-600 dark:text-secondary-400">
                    {t("positions.candidateAnalysis.strengths")}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {candidateAnalysis.overall.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-tertiary-600 dark:text-tertiary-300">
                    {t("positions.candidateAnalysis.gaps")}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {candidateAnalysis.overall.gaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={generating}
              onClick={runAnalysis}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating
                ? t("positions.candidateAnalysis.generating")
                : t("positions.candidateAnalysis.regenerate")}
            </Button>
          </div>
        )}

        {generating && (
          <div className="space-y-2 rounded-lg border p-4">
            {SECTION_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                {sections[key] === "done" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className={sections[key] === "done" ? "text-muted-foreground" : ""}>
                  {sectionLabels[key]}
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {t("positions.candidateAnalysis.takesMinutes")}
            </p>
          </div>
        )}

        {error && !generating && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={runAnalysis}>
              {t("positions.candidateAnalysis.errorRetry")}
            </Button>
          </div>
        )}

        {!candidateAnalysis && hasResume && !generating && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-[180px] truncate">{chipName}</span>
              {staged && (
                <button
                  type="button"
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setStaged(null);
                    setPasteOpen(false);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
            <Button onClick={runAnalysis} disabled={generating}>
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Sparkles className="mr-2 h-4 w-4" />
              {t("positions.candidateAnalysis.generate")}
            </Button>
          </div>
        )}

        {!candidateAnalysis && !hasResume && !generating && (
          <div className="rounded-lg border border-dashed">
            <div className="flex flex-col items-center gap-3 py-6">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFile}
              />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={extracting}
                    >
                      {extracting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {t("positions.uploadResume")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-72 text-xs">
                    {t("positions.candidateAnalysis.uploadTip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {pasteOpen ? (
                <div className="w-full space-y-2 px-6">
                  <Textarea
                    rows={5}
                    placeholder={t("positions.pasteResume")}
                    onChange={(e) =>
                      setStaged(
                        e.target.value.trim()
                          ? { text: e.target.value }
                          : null,
                      )
                    }
                  />
                  <Button variant="ghost" size="sm" onClick={() => { setPasteOpen(false); setStaged(null); }}>
                    <X className="mr-1 h-3.5 w-3.5" />
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <Button variant="link" size="sm" onClick={() => setPasteOpen(true)}>
                  {t("positions.candidateAnalysis.pasteToggle")}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
