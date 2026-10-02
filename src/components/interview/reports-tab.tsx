"use client";

import { ReportView } from "@/components/interview/report-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { runBatchSummaries } from "@/lib/report-backfill";
import {
  Calculator,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

/** Auto-refreshes every 30s so newly completed candidates appear live. */
const REFRESH_MS = 30_000;

export function ReportsTab({ interviewId }: { interviewId: string }) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState(false);
  // Idempotency guard: a second click while a run is in flight is a no-op.
  const runningRef = useRef(false);
  const [progress, setProgress] = useState<{
    done: number;
    failed: number;
    total: number;
    current: string | null;
  } | null>(null);

  const report = trpc.report.get.useQuery(
    { interviewId },
    // Suspend the 30s auto-refetch while a backfill run is active — the loop
    // already invalidates at the end, and table re-renders each tick were
    // perceptible as input lag on big interview rosters.
    { refetchInterval: progress === null ? REFRESH_MS : false },
  );

  const pending = (report.data?.report.rows ?? []).filter(
    (r) => r.status === "COMPLETED" && r.overallScore === null && r.sessionId,
  );

  const completed = (report.data?.report.rows ?? []).filter(
    (r) => r.status === "COMPLETED" && r.sessionId,
  );

  const handleBackfill = useCallback(async () => {
    if (runningRef.current || pending.length === 0) return;
    runningRef.current = true;
    setProgress({ done: 0, failed: 0, total: pending.length, current: null });
    try {
      const { failed } = await runBatchSummaries(
        pending.map((r) => ({ sessionId: r.sessionId, name: r.name })),
        { concurrency: 5, onProgress: setProgress },
      );
      if (failed > 0) {
        toast({
          title: "Backfill finished with failures",
          description: `${failed} session(s) could not be scored. You can safely run it again.`,
          variant: "destructive",
        });
      }
    } finally {
      runningRef.current = false;
      setProgress(null);
      utils.report.get.invalidate({ interviewId });
    }
  }, [pending, interviewId, utils, toast]);

  const handleRegenerate = useCallback(async () => {
    if (runningRef.current || completed.length === 0) return;
    if (
      !window.confirm(
        `Regenerate AI summaries for all ${completed.length} completed sessions? Existing summaries and scores will be overwritten.`,
      )
    )
      return;
    runningRef.current = true;
    setProgress({ done: 0, failed: 0, total: completed.length, current: null });
    try {
      const { failed } = await runBatchSummaries(
        completed.map((r) => ({ sessionId: r.sessionId, name: r.name })),
        { concurrency: 5, force: true, onProgress: setProgress },
      );
      if (failed > 0) {
        toast({
          title: "Regeneration finished with failures",
          description: `${failed} session(s) could not be regenerated. You can safely run it again.`,
          variant: "destructive",
        });
      }
    } finally {
      runningRef.current = false;
      setProgress(null);
      utils.report.get.invalidate({ interviewId });
    }
  }, [completed, interviewId, utils, toast]);

  const createLink = trpc.report.createLink.useMutation({
    onSuccess: () => {
      utils.report.get.invalidate({ interviewId });
      toast({ title: "Report link created and copied" });
    },
    onError: (err) =>
      toast({ title: "Failed to create link", description: err.message, variant: "destructive" }),
  });
  const deleteLink = trpc.report.deleteLink.useMutation({
    onSuccess: () => utils.report.get.invalidate({ interviewId }),
    onError: (err) =>
      toast({ title: "Failed to delete link", description: err.message, variant: "destructive" }),
  });

  const handleCreate = useCallback(async () => {
    const { token } = await createLink.mutateAsync({ interviewId });
    const url = `${window.location.origin}/r/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [createLink, interviewId]);

  const token = report.data?.linkToken ?? null;
  const shareUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${token}` : "";

  return (
    <div className="space-y-6">
      {/* Share link management — one live link per interview */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Share2 className="h-4 w-4 text-primary" />
              Share report link
            </p>
            <p className="text-xs text-muted-foreground">
              Anyone with the link sees this live comparison — it updates
              automatically as candidates finish.
            </p>
          </div>
          {report.isLoading ? null : !token ? (
            <Button onClick={handleCreate} disabled={createLink.isPending}>
              {createLink.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Globe className="mr-2 h-4 w-4" />
              )}
              Create report link
            </Button>
          ) : (
            <div className="flex w-full max-w-xl items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Input
                  readOnly
                  value={shareUrl}
                  className="bg-muted/50 pr-20 text-xs text-muted-foreground"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-0.5 top-1/2 h-7 -translate-y-1/2 gap-1.5 text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    toast({ title: "Link copied to clipboard" });
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Open report"
                onClick={() => window.open(`/r/${token}`, "_blank")}
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Delete link — the current URL stops working"
                onClick={() => deleteLink.mutate({ interviewId })}
                disabled={deleteLink.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backfill: generate AI scores for completed sessions that lack them.
          Sequential + idempotent — re-clicking never stacks a second run. */}
      {!report.isLoading && pending.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4 text-primary" />
                {pending.length} completed session{pending.length > 1 ? "s" : ""} not scored yet
              </p>
              <p className="text-xs text-muted-foreground">
                Runs 5 at a time, oldest pending first. Keep this tab open
                until it finishes.
              </p>
            </div>
            <Button onClick={handleBackfill} disabled={progress !== null}>
              {progress ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress.done + progress.failed}/{progress.total}
                  {progress.current ? ` — ${progress.current}` : ""}
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculate scores
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Regenerate: rebuild AI summaries for every completed session,
          overwriting existing ones — e.g. to switch report language. */}
      {!report.isLoading && completed.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <RefreshCw className="h-4 w-4 text-primary" />
                Regenerate all {completed.length} summar{completed.length > 1 ? "ies" : "y"}
              </p>
              <p className="text-xs text-muted-foreground">
                Rebuilds summaries and scores using the current interview
                language, overwriting existing ones. Keep this tab open until
                it finishes.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={progress !== null}
            >
              {progress ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress.done + progress.failed}/{progress.total}
                  {progress.current ? ` — ${progress.current}` : ""}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate summaries
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {report.isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-[400px]" />
        </div>
      ) : report.data ? (
        <ReportView
          data={report.data.report}
          sessionBasePath={`/interviews/${interviewId}/edit/sessions`}
        />
      ) : null}
    </div>
  );
}
