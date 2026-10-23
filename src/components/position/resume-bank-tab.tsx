"use client";

import { useAppLocale } from "@/components/app-locale-provider";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { parseOneResume } from "@/lib/resume-parse-client";
import { trpc } from "@/lib/trpc/client";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Mail,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

// listCandidates returns loosely-typed Supabase rows — pin the view shape here.
interface BankCandidate {
  id: string;
  name: string;
  email: string | null;
  resumeText: string | null;
  resumeFileName: string | null;
}

interface BankInvite {
  positionCandidateId: string;
  interviewId: string;
  candidate: {
    id: string;
    name: string | null;
    sessionId: string | null;
    session: { id: string; status: string } | null;
  } | null;
  interview: { id: string; title: string } | null;
}

interface UploadEntry {
  name: string;
  status: "working" | "done" | "error";
  error?: string;
}

export function ResumeBankTab({ positionId }: { positionId: string }) {
  const { t } = useAppLocale();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const candidatesQuery = trpc.position.listCandidates.useQuery({ jobPositionId: positionId });
  const detail = trpc.position.get.useQuery({ id: positionId });

  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<BankCandidate | null>(null);
  const [pickInterview, setPickInterview] = useState("");
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const bulkAdd = trpc.position.bulkAddCandidates.useMutation({
    onSuccess: (data) => {
      utils.position.listCandidates.invalidate({ jobPositionId: positionId });
      toast({ title: t("positions.imported", { count: data.created }) });
    },
    onError: (err) => toast({ title: err.message, variant: "destructive" }),
  });

  const removeCandidate = trpc.position.removeCandidate.useMutation({
    onSuccess: () => {
      utils.position.listCandidates.invalidate({ jobPositionId: positionId });
    },
    onError: (err) => toast({ title: err.message, variant: "destructive" }),
  });

  const invite = trpc.position.invite.useMutation({
    onSuccess: (res) => {
      utils.position.listCandidates.invalidate({ jobPositionId: positionId });
      setInviteResult({ inviteUrl: res.inviteUrl, emailSent: res.emailSent });
    },
    onError: (err) => toast({ title: err.message, variant: "destructive" }),
  });

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;

    setUploads(files.map((f) => ({ name: f.name, status: "working" as const })));
    const payload: {
      name?: string;
      email?: string;
      resumeText: string;
      resumeFileName: string;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/ai/extract-text", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Extraction failed");

        let name: string | undefined;
        let email: string | undefined;
        try {
          const parsed = await parseOneResume(file, () => {});
          name = parsed.name || undefined;
          email = parsed.email || undefined;
        } catch {
          // AI parse is best-effort prefill; the resume text is what matters.
        }

        payload.push({
          resumeText: data.text as string,
          resumeFileName: file.name,
          name,
          email,
        });
        setUploads((prev) => prev.map((u, j) => (j === i ? { ...u, status: "done" } : u)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        setUploads((prev) =>
          prev.map((u, j) => (j === i ? { ...u, status: "error", error: message } : u)),
        );
      }
    }

    if (payload.length > 0) {
      await bulkAdd.mutateAsync({ jobPositionId: positionId, candidates: payload });
    }
    setTimeout(() => setUploads([]), 3000);
  };

  const openInviteDialog = (candidate: BankCandidate) => {
    setInviteFor(candidate);
    setInviteResult(null);
    setPickInterview("");
    setCopied(false);
  };

  const candidates = ((candidatesQuery.data?.candidates ?? []) as unknown as BankCandidate[]);
  const invites = ((candidatesQuery.data?.invites ?? []) as unknown as BankInvite[]);
  const interviews = detail.data?.interviews ?? [];

  const invitesFor = (candidateId: string) =>
    invites.filter((inv) => inv.positionCandidateId === candidateId);

  const inviteStatus = (inv: BankInvite) => {
    const status = inv.candidate?.session?.status;
    if (status === "COMPLETED") {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{t("positions.statusCompleted")}</Badge>;
    }
    if (status) return <Badge variant="secondary">{t("positions.statusPending")}</Badge>;
    return <Badge variant="outline">{t("positions.invited")}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t("positions.tabBank")}</CardTitle>
          <CardDescription>{t("positions.bankHint")}</CardDescription>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => fileRef.current?.click()} disabled={uploads.some((u) => u.status === "working")}>
                <Upload className="mr-2 h-4 w-4" />
                {t("positions.uploadResume")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-72 text-xs">
              {t("positions.uploadResumeTip")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="space-y-3">
        {uploads.length > 0 && (
          <div className="space-y-1.5">
            {uploads.map((u, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                {u.status === "working" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                {u.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                {u.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.error && <span className="shrink-0 text-xs text-destructive">{u.error}</span>}
              </div>
            ))}
          </div>
        )}

        {candidatesQuery.isLoading ? (
          <Skeleton className="h-48" />
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("positions.bankEmpty")}
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("positions.name")}</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>{t("positions.resume")}</TableHead>
                  <TableHead>{t("positions.invited")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="font-medium">{candidate.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.email ?? "-"}
                    </TableCell>
                    <TableCell>
                      {candidate.resumeFileName ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[160px] truncate">{candidate.resumeFileName}</span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {invitesFor(candidate.id).map((inv) => (
                          <div key={inv.interviewId} className="flex items-center gap-1.5 text-xs">
                            <span className="max-w-[140px] truncate">{inv.interview?.title ?? inv.interviewId}</span>
                            {inviteStatus(inv)}
                          </div>
                        ))}
                        {invitesFor(candidate.id).length === 0 && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openInviteDialog(candidate)}>
                          <Mail className="h-3 w-3" />
                          {invitesFor(candidate.id).length > 0
                            ? t("positions.reinvite")
                            : t("positions.invite")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setRemoveId(candidate.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Invite dialog */}
      <Dialog open={!!inviteFor} onOpenChange={(open) => { if (!open) setInviteFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("positions.invite")} — {inviteFor?.name}
            </DialogTitle>
            <DialogDescription>{t("positions.pickInterview")}</DialogDescription>
          </DialogHeader>
          {inviteResult ? (
            <div className="space-y-3">
              <Badge
                className={
                  inviteResult.emailSent
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }
              >
                {inviteResult.emailSent ? t("positions.emailSent") : t("positions.emailFailed")}
              </Badge>
              <div className="space-y-1.5">
                <Label>{t("positions.inviteLink")}</Label>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                    {inviteResult.inviteUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteResult.inviteUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? t("positions.copied") : t("positions.copy")}
                  </Button>
                </div>
              </div>
              <Button variant="outline" onClick={() => setInviteFor(null)}>
                {t("common.close")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={pickInterview} onValueChange={setPickInterview}>
                <SelectTrigger>
                  <SelectValue placeholder={t("positions.pickInterview")} />
                </SelectTrigger>
                <SelectContent>
                  {interviews.map((iv) => (
                    <SelectItem key={iv.id} value={iv.id}>
                      {iv.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {interviews.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("positions.interviewsEmpty")}</p>
              )}
              <Button
                disabled={!pickInterview || invite.isPending}
                onClick={() => {
                  if (inviteFor && pickInterview) {
                    invite.mutate({ positionCandidateId: inviteFor.id, interviewId: pickInterview });
                  }
                }}
              >
                {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("positions.sendInvite")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove candidate confirm */}
      <AlertDialog open={!!removeId} onOpenChange={(open) => { if (!open) setRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("positions.removeCandidateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("positions.removeCandidateConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeId) {
                  removeCandidate.mutate({ id: removeId });
                  setRemoveId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
