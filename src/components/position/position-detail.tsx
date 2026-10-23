"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import { ExternalLink, FileText, Loader2, MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function PositionJdTab({ positionId }: { positionId: string }) {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const detail = trpc.position.get.useQuery({ id: positionId });
  const [jd, setJd] = useState("");

  useEffect(() => {
    if (detail.data) setJd(detail.data.position.jobDescription ?? "");
  }, [detail.data]);

  const updateMutation = trpc.position.update.useMutation({
    onSuccess: () => {
      toast({ title: t("positions.jdSaved") });
    },
    onError: (err) => toast({ title: err.message, variant: "destructive" }),
  });

  if (detail.isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("positions.jd")}</CardTitle>
        <CardDescription>{t("positions.jdHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={12}
          placeholder={t("positions.jdPlaceholder")}
          value={jd}
          onChange={(e) => setJd(e.target.value)}
        />
        <Button
          disabled={updateMutation.isPending || jd === (detail.data?.position.jobDescription ?? "")}
          onClick={() => updateMutation.mutate({ id: positionId, jobDescription: jd })}
        >
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

export function PositionInterviewsTab({ positionId }: { positionId: string }) {
  const { t } = useAppLocale();
  const router = useRouter();
  const detail = trpc.position.get.useQuery({ id: positionId });

  if (detail.isLoading) return <Skeleton className="h-48" />;

  const interviews = detail.data?.interviews ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("positions.tabInterviews")}</CardTitle>
          <CardDescription>{t("positions.interviewsHint")}</CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/interviews?jobPositionId=${positionId}`)}
          >
            {t("positions.createFromTemplate")}
          </Button>
          <Button onClick={() => router.push(`/interviews/new?jobPositionId=${positionId}`)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("positions.createInterview")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {interviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("positions.interviewsEmpty")}
          </p>
        ) : (
          <div className="space-y-2">
            {interviews.map((interview) => (
              <Link
                key={interview.id}
                href={`/interviews/${interview.id}/results`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {interview.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(interview.createdAt).toLocaleDateString()}
                </span>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
