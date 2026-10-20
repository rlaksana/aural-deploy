"use client";

import { useCallback, useEffect, useState } from "react";

interface UseProctoringCameraOptions {
  /** Consent granted && interview proctoring enabled. */
  enabled: boolean;
  sessionId: string;
  sessionToken?: string | null;
}

/**
 * Proctoring webcam: opens the camera only after explicit consent, keeps the
 * stream alive for instant violation-moment captures, and uploads frames via
 * the existing /api/session/upload route (screenshots bucket). Denied or
 * unavailable camera degrades to capture-disabled — the session continues.
 */
export function useProctoringCamera({
  enabled,
  sessionId,
  sessionToken,
}: UseProctoringCameraOptions) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [streamRef] = useState<{ current: MediaStream | null }>(() => ({ current: null }));

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 320 }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        streamRef.current = s;
        if (videoEl) videoEl.srcObject = s;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const captureNow = useCallback(async (): Promise<string | null> => {
    const stream = streamRef.current;
    const video = videoEl;
    if (!stream || !video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7),
    );
    if (!blob) return null;
    const fd = new FormData();
    fd.set("file", blob, `proctoring-${Date.now()}.jpg`);
    fd.set("sessionId", sessionId);
    fd.set("type", "screenshot");
    if (sessionToken) fd.set("sessionToken", sessionToken);
    const res = await fetch("/api/session/upload", { method: "POST", body: fd });
    if (!res.ok) return null;
    const data = (await res.json()) as { path?: string };
    return data.path ?? null;
  }, [sessionId, sessionToken, videoEl, streamRef]);

  return { setVideoEl, captureNow, ready, failed };
}
