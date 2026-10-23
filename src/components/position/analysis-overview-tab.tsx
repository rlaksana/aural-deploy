"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

// Pinned view shapes over the loosely-typed Supabase rows (same as resume-bank-tab).
interface BankCandidate {
  id: string;
  name: string;
  email: string | null;
}

interface BankInvite {
  positionCandidateId: string;
  interviewId: string;
  candidate: {
    id: string;
    sessionId: string | null;
    session: { id: string; status: string; candidateAnalysis: unknown } | null;
  } | null;
}

export function AnalysisOverviewTab({ positionId }: { positionId: string }) {
  const { t } = useAppLocale();
  const candidatesQuery = trpc.position.listCandidates.useQuery({ jobPositionId: positionId });
  const detail = trpc.position.get.useQuery({ id: positionId });

  if (candidatesQuery.isLoading || detail.isLoading) {
    return <Skeleton className="h-64" />;
  }

  const candidates = ((candidatesQuery.data?.candidates ?? []) as unknown as BankCandidate[]);
  const invites = ((candidatesQuery.data?.invites ?? []) as unknown as BankInvite[]);
  const interviews = detail.data?.interviews ?? [];

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("positions.bankEmpty")}</p>
        </CardContent>
      </Card>
    );
  }

  const inviteFor = (candidateId: string, interviewId: string) =>
    invites.find((inv) => inv.positionCandidateId === candidateId && inv.interviewId === interviewId);

  return (
    <div className="space-y-3">
      <CardDescription>{t("positions.analysisHint")}</CardDescription>
      <div className="grid gap-4 md:grid-cols-2">
        {candidates.map((candidate) => (
          <Card key={candidate.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{candidate.name}</CardTitle>
              {candidate.email && (
                <CardDescription>{candidate.email}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {interviews.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("positions.interviewsEmpty")}</p>
              )}
              {interviews.map((interview) => {
                const inv = inviteFor(candidate.id, interview.id);
                const session = inv?.candidate?.session ?? null;
                return (
                  <div
                    key={interview.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{interview.title}</span>
                    {inv ? (
                      <>
                        <Badge
                          variant={session?.status === "COMPLETED" ? "default" : "secondary"}
                        >
                          {session?.status === "COMPLETED"
                            ? t("positions.statusCompleted")
                            : t("positions.statusPending")}
                        </Badge>
                        {session?.candidateAnalysis != null && (
                          <Badge variant="outline">{t("positions.analysisDone")}</Badge>
                        )}
                        {session && (
                          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                            <Link
                              href={`/interviews/${interview.id}/results?session=${session.id}`}
                            >
                              {t("positions.openAnalysis")}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Button>
                        )}
                      </>
                    ) : (
                      <Badge variant="outline">{t("positions.notInvited")}</Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
