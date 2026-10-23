"use client";

import { useAppLocale } from "@/components/app-locale-provider";
import { useProject } from "@/components/project-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { trpc } from "@/lib/trpc/client";
import {
  Briefcase,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// position.list's inferred row type is narrowed to { id } server-side.
type PositionRow = {
  id: string;
  title: string;
  jobDescription: string | null;
};

export default function PositionsPage() {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const router = useRouter();
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const utils = trpc.useUtils();

  const positions = trpc.position.list.useQuery(
    { limit: 100, projectId: projectId ?? undefined },
    { enabled: !!projectId },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [jdLoading, setJdLoading] = useState(false);
  const jdFileRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createMutation = trpc.position.create.useMutation({
    onSuccess: (position) => {
      utils.position.list.invalidate();
      setDialogOpen(false);
      setTitle("");
      setJd("");
      router.push(`/positions/${position.id}`);
    },
    onError: (err) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const removeMutation = trpc.position.remove.useMutation({
    onSuccess: () => {
      utils.position.list.invalidate();
      toast({ title: t("positions.deleted") });
    },
    onError: (err) =>
      toast({ title: err.message, variant: "destructive" }),
  });

  const handleJdFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (jdFileRef.current) jdFileRef.current.value = "";
    if (!file) return;
    setJdLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/extract-text", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setJd(data.text as string);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Extraction failed",
        variant: "destructive",
      });
    } finally {
      setJdLoading(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !title.trim()) return;
    createMutation.mutate({
      projectId,
      title: title.trim(),
      jobDescription: jd.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("positions.title")}</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("positions.new")}
        </Button>
      </div>

      {positions.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (positions.data?.positions ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-lg font-semibold">{t("positions.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("positions.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {((positions.data?.positions ?? []) as unknown as PositionRow[]).map(
            (position) => (
              <Card
                key={position.id}
                className="group relative cursor-pointer transition-all hover:shadow-md hover:border-primary/30 hover:bg-muted/30"
                onClick={() => router.push(`/positions/${position.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <CardTitle className="truncate text-base">
                        {position.title}
                      </CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(position.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {position.jobDescription ?? t("positions.noJd")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {position.jobDescription
                      ? t("positions.hasJd")
                      : t("positions.noJd")}
                  </Badge>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("positions.new")}</DialogTitle>
            <DialogDescription>{t("positions.emptyHint")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="position-title">{t("positions.name")}</Label>
              <Input
                id="position-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="position-jd">{t("positions.jd")}</Label>
                <input
                  ref={jdFileRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleJdFile}
                />
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => jdFileRef.current?.click()}
                        disabled={jdLoading}
                      >
                        {jdLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        PDF
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-72 text-xs">
                      {t("positions.uploadResumeTip")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {jd && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{t("positions.jd")}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setJd("")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <Textarea
                id="position-jd"
                rows={6}
                placeholder={t("positions.jdPlaceholder")}
                value={jd}
                onChange={(e) => setJd(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!title.trim() || createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("positions.new")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("positions.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("positions.removeConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) {
                  removeMutation.mutate({ id: deleteId });
                  setDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
