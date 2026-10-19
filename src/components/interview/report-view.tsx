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
import { Loader2, RefreshCw, Trophy, UserCheck, Users } from "lucide-react";

export function scoreColor(score: number): string {
  return score >= 7
    ? "text-green-700 dark:text-green-400"
    : score >= 4
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400";
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "default" as const;
    case "IN_PROGRESS":
      return "outline" as const;
    case "ABANDONED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
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
  const { rows, criteriaNames, questionLabels } = data;
  const scored = rows.filter((r) => r.overallScore !== null);
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, r) => sum + (r.overallScore ?? 0), 0) / scored.length
      : null;
  const top = scored[0] ?? null;

  const criteriaAvg = Object.fromEntries(
    criteriaNames.map((name) => {
      const values = rows
        .map((r) => r.criteria[name])
        .filter((v): v is number => typeof v === "number");
      const avg =
        values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : null;
      return [name, avg];
    }),
  );

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
          <div className="overflow-x-auto code-scrollbar">
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="min-w-[160px]">Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  {criteriaNames.map((name) => (
                    <TableHead
                      key={name}
                      className="max-w-[200px] truncate whitespace-nowrap"
                      title={questionLabels[name] ?? name}
                    >
                      {name}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[220px]">Summary</TableHead>
                  <TableHead className="whitespace-nowrap">Finished</TableHead>
                  {onRegenerate && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <BodyRow
                    key={`${row.sessionId}-${i}`}
                    row={row}
                    rank={row.overallScore !== null ? i + 1 : null}
                    criteriaNames={criteriaNames}
                    sessionBasePath={sessionBasePath}
                    onRegenerate={onRegenerate}
                    regenerating={!!row.sessionId && regeneratingSessionId === row.sessionId}
                  />
                ))}
                {criteriaNames.length > 0 && scored.length > 0 && (
                  <TableRow className="border-t bg-muted/40 font-medium hover:bg-muted/40">
                    <TableCell colSpan={4} className="text-right text-sm">
                      Avg per criterion
                    </TableCell>
                    {criteriaNames.map((name) => {
                      const avg = criteriaAvg[name];
                      return (
                        <TableCell key={name} className="whitespace-nowrap">
                          {avg !== null ? (
                            <span className={scoreColor(avg)}>
                              {avg.toFixed(1)}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell colSpan={onRegenerate ? 3 : 2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function BodyRow({
  row,
  rank,
  criteriaNames,
  sessionBasePath,
  onRegenerate,
  regenerating,
}: {
  row: ReportRow;
  rank: number | null;
  criteriaNames: string[];
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
      <TableCell className="max-w-[240px] truncate">{nameCell}</TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant(row.status)}>
          {row.status.replace("_", " ")}
        </Badge>
      </TableCell>
      <TableCell>
        {row.overallScore !== null ? (
          <span className={cn("font-semibold", scoreColor(row.overallScore))}>
            {row.overallScore.toFixed(1)}/10
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      {criteriaNames.map((name) => {
        const v = row.criteria[name];
        return (
          <TableCell key={name}>
            {typeof v === "number" ? (
              <span className={scoreColor(v)}>{v.toFixed(1)}</span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        );
      })}
      <TableCell className="max-w-[320px]">
        {row.summary ? (
          <p
            className="line-clamp-2 text-xs text-muted-foreground"
            title={row.summary}
          >
            {row.summary}
          </p>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatDate(row.completedAt)}
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
