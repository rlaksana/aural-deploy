"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InterviewReport, ReportRow } from "@/lib/interview-report";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Loader2,
  MinusCircle,
  RefreshCw,
  Trophy,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

export function scoreColor(score: number): string {
  return score >= 7
    ? "text-green-700 dark:text-green-400"
    : score >= 4
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400";
}

function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString(undefined, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":
      return (
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      );
    case "IN_PROGRESS":
      return <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case "ABANDONED":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    default:
      return (
        <MinusCircle className="h-4 w-4 text-muted-foreground" />
      );
  }
}

type SortKey = `q:${string}` | "name" | "score" | "status" | "finished";

/** Compact clickable column header used for every sortable column. */
function SortHead({
  label,
  sortKey,
  active,
  dir,
  onSort,
  center,
  title,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  center?: boolean;
  title?: string;
}) {
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none hover:bg-muted/50",
        center && "px-2 text-center",
      )}
      title={title}
      onClick={() => onSort(sortKey)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          center && "justify-center",
        )}
      >
        {label}
        {active ? (
          dir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}

/**
 * Aggregate interview report: ranked candidates with overall + per-criteria
 * scores. Pure presentational — used by the dashboard Reports tab and the
 * public /r/{token} page.
 */
export function ReportView({
  data,
  sessionBasePath,
  onRegenerate,
  regeneratingSessionId,
}: {
  data: InterviewReport;
  /** When set, clicking a row opens this path with ?session={id} */
  sessionBasePath?: string;
  /** Dashboard-only: enables the per-candidate regenerate action. */
  onRegenerate?: (row: ReportRow) => void;
  regeneratingSessionId?: string | null;
}) {
  const { rows, questionLabels } = data;
  // Per-question columns only ("Q1".."Qn") — criteria-name columns made the
  // table wide and mostly empty; question scores are what recruiters scan.
  const questionKeys = Object.keys(questionLabels).sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  const scored = rows.filter((r) => r.overallScore !== null);
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, r) => sum + (r.overallScore ?? 0), 0) / scored.length
      : null;
  const top = scored[0] ?? null;

  const questionAvg = Object.fromEntries(
    questionKeys.map((q) => {
      const values = rows
        .map((r) => r.criteria[q])
        .filter((v): v is number => typeof v === "number");
      const avg =
        values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : null;
      return [q, avg];
    }),
  );

  // Rank is fixed to the score order (server default); sorting reorders the
  // view without renumbering it.
  const ranked = useMemo(() => rows.map((row, i) => ({ row, rank: i + 1 })), [rows]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(
    null,
  );
  const handleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "desc"
          ? { key, dir: "asc" }
          : null
        : { key, dir: "desc" },
    );
  const sortValue = (r: ReportRow, key: SortKey): string | number => {
    switch (key) {
      case "name":
        return r.name.toLowerCase();
      case "score":
        return r.overallScore ?? -1;
      case "status":
        return r.status;
      case "finished":
        return r.completedAt ?? "";
      default:
        return r.criteria[key.slice(2)] ?? -1;
    }
  };
  const viewRows = useMemo(() => {
    if (!sort) return ranked;
    const { key, dir } = sort;
    return [...ranked].sort((a, b) => {
      const va = sortValue(a.row, key);
      const vb = sortValue(b.row, key);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return dir === "desc" ? -cmp : cmp;
    });
  }, [ranked, sort]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <UserCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">
                {completed.length}
                <span className="text-base text-muted-foreground">
                  {" "}
                  / {rows.length} candidates
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Avg Score</p>
              <p className="text-2xl font-bold">
                {avgScore !== null ? avgScore.toFixed(1) : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Trophy className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Top Performer</p>
              <p className="truncate text-2xl font-bold" title={top?.name}>
                {top ? top.name : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranked table */}
      <div className="rounded-lg border">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No candidates yet. Invite candidates or share the interview link to
            start collecting responses.
          </p>
        ) : (
          <Table className="border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">#</TableHead>
                <SortHead
                  label="Name"
                  sortKey="name"
                  active={sort?.key === "name"}
                  dir={sort?.dir ?? "desc"}
                  onSort={handleSort}
                />
                {questionKeys.map((q) => (
                  <SortHead
                    key={q}
                    label={q}
                    sortKey={`q:${q}`}
                    active={sort?.key === `q:${q}`}
                    dir={sort?.dir ?? "desc"}
                    onSort={handleSort}
                    center
                    title={questionLabels[q]}
                  />
                ))}
                <SortHead
                  label="Score"
                  sortKey="score"
                  active={sort?.key === "score"}
                  dir={sort?.dir ?? "desc"}
                  onSort={handleSort}
                />
                <TableHead className="w-12" title="Status" />
                <SortHead
                  label="Finished"
                  sortKey="finished"
                  active={sort?.key === "finished"}
                  dir={sort?.dir ?? "desc"}
                  onSort={handleSort}
                />
                {onRegenerate && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewRows.map(({ row, rank }) => (
                <BodyRow
                  key={`${row.sessionId}-${rank}`}
                  row={row}
                  rank={row.overallScore !== null ? rank : null}
                  questionKeys={questionKeys}
                  sessionBasePath={sessionBasePath}
                  onRegenerate={onRegenerate}
                  regenerating={!!row.sessionId && regeneratingSessionId === row.sessionId}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Average score per question — shows which questions candidates found
          hardest; hover a chip for the full question text. */}
      {questionKeys.length > 0 && scored.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Avg per question:</span>
          {questionKeys.map((q) => {
            const avg = questionAvg[q];
            return (
              <Badge
                key={q}
                variant="outline"
                className="whitespace-nowrap"
                title={questionLabels[q]}
              >
                {q}{" "}
                <span className={cn("ml-1 font-medium", avg !== null && scoreColor(avg))}>
                  {avg !== null ? avg.toFixed(1) : "-"}
                </span>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BodyRow({
  row,
  rank,
  questionKeys,
  sessionBasePath,
  onRegenerate,
  regenerating,
}: {
  row: ReportRow;
  rank: number | null;
  questionKeys: string[];
  sessionBasePath?: string;
  onRegenerate?: (row: ReportRow) => void;
  regenerating?: boolean;
}) {
  const hasSession = !!row.sessionId;

  const nameCell = (
    <span className="font-medium">
      {row.name}
      {row.source === "Walk-in" && (
        <Badge variant="secondary" className="ml-2 text-xs">
          Walk-in
        </Badge>
      )}
    </span>
  );

  return (
    <TableRow
      className={cn(
        hasSession && sessionBasePath && "cursor-pointer",
        !hasSession && "opacity-60",
      )}
      onClick={
        hasSession && sessionBasePath
          ? () =>
              window.open(
                `${sessionBasePath}?session=${row.sessionId}`,
                "_blank",
              )
          : undefined
      }
    >
      <TableCell className="text-muted-foreground">{rank ?? "-"}</TableCell>
      <TableCell className="max-w-[220px] truncate">{nameCell}</TableCell>
      {questionKeys.map((q) => {
        const v = row.criteria[q];
        return (
          <TableCell key={q} className="px-2 text-center">
            {typeof v === "number" ? (
              <span className={scoreColor(v)}>{v.toFixed(1)}</span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        );
      })}
      <TableCell>
        {row.overallScore !== null ? (
          <span className={cn("font-semibold", scoreColor(row.overallScore))}>
            {row.overallScore.toFixed(1)}/10
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell title={row.status.replace("_", " ")}>
        <StatusIcon status={row.status} />
      </TableCell>
      <TableCell
        className="whitespace-nowrap text-muted-foreground"
        title={formatDate(row.completedAt)}
      >
        {formatShortDate(row.completedAt)}
      </TableCell>
      {onRegenerate && (
        <TableCell className="w-10">
          {row.sessionId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={
                regenerating
                  ? "Regenerating…"
                  : `Regenerate AI summary for ${row.name}`
              }
              disabled={regenerating}
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate(row);
              }}
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
