"use client";

import { PreparingScreen } from "@/components/session/preparing-screen";
import { SessionEndedScreen } from "@/components/session/session-ended-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { bt, getLanguageKey } from "@/lib/i18n";
import { trpc } from "@/lib/trpc/client";
import { Link2Off, Loader2, Lock, MessageSquare, Mic, Plus, RotateCcw } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "aural_session_";

// Known session-create server errors, translated client-side; unknown messages pass through unchanged.
const CREATE_SESSION_ERRORS: Record<string, { zh: string; en: string; id?: string }> = {
  "Email is required for invite-only interviews.": {
    zh: "Email is required for invite-only interviews.",
    en: "Email is required for invite-only interviews.",
    id: "Email wajib diisi untuk wawancara khusus undangan.",
  },
  "Your email is not on the invite list for this interview.": {
    zh: "Your email is not on the invite list for this interview.",
    en: "Your email is not on the invite list for this interview.",
    id: "Emailmu tidak ada di daftar undangan untuk wawancara ini.",
  },
  "Interview not found or inactive": {
    zh: "Interview not found or inactive",
    en: "Interview not found or inactive",
    id: "Wawancara tidak ditemukan atau tidak aktif.",
  },
};

export default function PublicInterviewPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";
  const sidParam = searchParams.get("sid");
  const { toast } = useToast();

  useEffect(() => {
    if (isPreview && sidParam) {
      router.replace(`/i/${slug}/session?sid=${sidParam}&preview=true`);
    }
  }, [isPreview, sidParam, slug, router]);

  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [completed] = useState(false);

  // ── Existing session detection ─────────────────────────────────
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + slug);
      if (stored) setStoredSessionId(stored);
    } catch {
      // localStorage may be unavailable
    }
  }, [slug]);

  const existingSession = trpc.session.getById.useQuery(
    { id: storedSessionId! },
    { enabled: !!storedSessionId, retry: false },
  );

  useEffect(() => {
    if (!storedSessionId) return;
    if (existingSession.isError || (existingSession.data && existingSession.data.status !== "IN_PROGRESS")) {
      try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
      setStoredSessionId(null);
    }
  }, [existingSession.data, existingSession.isError, storedSessionId, slug]);

  const canResume = !!storedSessionId && existingSession.data?.status === "IN_PROGRESS";

  const interview = trpc.interview.getBySlug.useQuery({ slug }, { retry: false });

  const lang = getLanguageKey(interview.data?.language);

  const createSession = trpc.session.create.useMutation({
    onSuccess: (data) => {
      try { localStorage.setItem(STORAGE_PREFIX + slug, data.sessionId); } catch { /* noop */ }
      goToSession(data.sessionId);
    },
    onError: (err) => {
      const translated = CREATE_SESSION_ERRORS[err.message];
      toast({
        title: bt(lang, {
          en: "Failed to start interview",
          zh: "Failed to start interview",
          id: "Gagal memulai wawancara",
        }),
        description: translated ? bt(lang, translated) : err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    router.prefetch(`/i/${slug}/session`);
  }, [router, slug]);

  const goToSession = useCallback((sid: string) => {
    router.push(`/i/${slug}/session?sid=${sid}`);
  }, [router, slug]);

  // ── Resume / Start-new handlers ────────────────────────────────
  const handleResume = useCallback(() => {
    if (!existingSession.data || !storedSessionId) return;
    goToSession(storedSessionId);
  }, [existingSession.data, storedSessionId, goToSession]);

  const handleStartNew = useCallback(() => {
    try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
    setStoredSessionId(null);
  }, [slug]);

  if (isPreview && sidParam) {
    return <PreparingScreen />;
  }

  if (interview.isLoading) {
    return <PreparingScreen />;
  }

  if (interview.isError || !interview.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Link2Off className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">
              {bt(lang, {
                en: "Interview Not Available",
                zh: "Interview Not Available",
                id: "Wawancara Tidak Tersedia",
              })}
            </h2>
            <p className="text-muted-foreground mt-2">
              {bt(lang, {
                en: "This interview may have been removed or is no longer accepting responses.",
                zh: "This interview may have been removed or is no longer accepting responses.",
                id: "Wawancara ini mungkin telah dihapus atau tidak lagi menerima jawaban.",
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completed) {
    try { localStorage.removeItem(STORAGE_PREFIX + slug); } catch { /* noop */ }
    return <SessionEndedScreen />;
  }

  if (storedSessionId && existingSession.isLoading) {
    return <PreparingScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquare className="h-6 w-6" />
          </div>
          <CardTitle className="font-heading text-2xl">{interview.data.title}</CardTitle>
          {interview.data.description && (
            <CardDescription>{interview.data.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {/* ── Invite-only notice ───────────────────────── */}
          {interview.data.requireInvite && !isPreview && !canResume && (
            <div className="py-6 text-center">
              <Lock className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 font-medium">
                {bt(lang, {
                  en: "Invite only",
                  zh: "Invite only",
                  id: "Khusus undangan",
                })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {bt(lang, {
                  en: "This interview is accessible only through a personal invite link. Please check your email for the link from the interviewer.",
                  zh: "This interview is accessible only through a personal invite link. Please check your email for the link from the interviewer.",
                  id: "Wawancara ini hanya dapat diakses melalui tautan undangan pribadi. Silakan periksa emailmu untuk tautan dari pewawancara.",
                })}
              </p>
            </div>
          )}

          {/* ── Resume banner ──────────────────────────────── */}
          {canResume && (
            <div className="mb-6 space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">
                  {bt(lang, {
                    en: "You have an unfinished interview session.",
                    zh: "You have an unfinished interview session.",
                    id: "Kamu memiliki sesi wawancara yang belum selesai.",
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bt(lang, {
                    en: "Pick up right where you left off, or start fresh.",
                    zh: "Pick up right where you left off, or start fresh.",
                    id: "Lanjutkan dari tempat terakhirmu, atau mulai dari awal.",
                  })}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button className="flex-1" onClick={handleResume}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {bt(lang, {
                      en: "Continue Interview",
                      zh: "Continue Interview",
                      id: "Lanjutkan Wawancara",
                    })}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleStartNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    {bt(lang, {
                      en: "Start New",
                      zh: "Start New",
                      id: "Mulai Baru",
                    })}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Start form ────────────────────────────────── */}
          {(!interview.data.requireInvite || isPreview) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createSession.mutate({
                  interviewSlug: slug,
                  participantName,
                  participantEmail,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">
                  Your Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">
                  Your Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={participantEmail}
                  onChange={(e) => setParticipantEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <p>
                  {bt(lang, {
                    en: `${interview.data.questions.length} questions`,
                    zh: `${interview.data.questions.length} questions`,
                    id: `${interview.data.questions.length} pertanyaan`,
                  })}{" "}
                  &middot;{" "}
                  {interview.data.timeLimitMinutes
                    ? bt(lang, {
                        en: `${interview.data.timeLimitMinutes} min`,
                        zh: `${interview.data.timeLimitMinutes} min`,
                        id: `${interview.data.timeLimitMinutes} menit`,
                      })
                    : bt(lang, {
                        en: "No time limit",
                        zh: "No time limit",
                        id: "Tanpa batas waktu",
                      })}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-2 text-sm">
                {interview.data.voiceEnabled ? (
                  <>
                    <Mic className="h-4 w-4 text-primary" />
                    <span>
                      {interview.data.chatEnabled
                        ? bt(lang, {
                            en: "This interview supports voice and text chat",
                            zh: "This interview supports voice and text chat",
                            id: "Wawancara ini mendukung suara dan obrolan teks",
                          })
                        : bt(lang, {
                            en: "This interview uses voice mode (requires Chrome or Edge)",
                            zh: "This interview uses voice mode (requires Chrome or Edge)",
                            id: "Wawancara ini menggunakan mode suara (memerlukan Chrome atau Edge)",
                          })}
                    </span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span>
                      {bt(lang, {
                        en: "This interview uses text chat",
                        zh: "This interview uses text chat",
                        id: "Wawancara ini menggunakan obrolan teks",
                      })}
                    </span>
                  </>
                )}
              </div>

              <Button
                className="w-full"
                type="submit"
                disabled={
                  !participantName.trim() ||
                  !participantEmail.trim() ||
                  createSession.isLoading
                }
              >
                {createSession.isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Begin Interview
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
