"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import {
  PositionInterviewsTab,
  PositionJdTab,
} from "@/components/position/position-detail";
import { AnalysisOverviewTab } from "@/components/position/analysis-overview-tab";
import { ResumeBankTab } from "@/components/position/resume-bank-tab";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc/client";
import { ArrowLeft, Briefcase } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function PositionDetailPage() {
  const { t } = useAppLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const detail = trpc.position.get.useQuery({ id });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push("/positions")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Briefcase className="h-5 w-5 text-muted-foreground" />
        <h1 className="truncate text-2xl font-bold">
          {detail.isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            detail.data?.position.title ?? id
          )}
        </h1>
      </div>

      <Tabs defaultValue="jd" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jd">{t("positions.tabJd")}</TabsTrigger>
          <TabsTrigger value="interviews">{t("positions.tabInterviews")}</TabsTrigger>
          <TabsTrigger value="bank">{t("positions.tabBank")}</TabsTrigger>
          <TabsTrigger value="analysis">{t("positions.tabAnalysis")}</TabsTrigger>
        </TabsList>
        <TabsContent value="jd">
          <PositionJdTab positionId={id} />
        </TabsContent>
        <TabsContent value="interviews">
          <PositionInterviewsTab positionId={id} />
        </TabsContent>
        <TabsContent value="bank">
          <ResumeBankTab positionId={id} />
        </TabsContent>
        <TabsContent value="analysis">
          <AnalysisOverviewTab positionId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
