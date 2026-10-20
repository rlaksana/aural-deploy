"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AntiCheatingViolation {
  type:
    | "page_departure"
    | "paste"
    | "multi_screen"
    | "tab_switch"
    | "focus_lost"
    | "copy"
    | "cut";
  timestamp: number;
  detail?: string;
}

export type ProctoringEvent = "visibility_hidden" | "blur_expired" | "copy" | "cut";

/**
 * Pure: proctoring-mode DOM event -> classified violation (or null). The
 * granular types let the recruiter's integrity summary distinguish "checked
 * another tab" from "window lost focus" — page_departure stays the legacy
 * coarse signal for non-proctored sessions.
 */
export function mapProctoringViolation(
  event: ProctoringEvent,
  now: number,
): AntiCheatingViolation | null {
  switch (event) {
    case "visibility_hidden":
      return { type: "tab_switch", timestamp: now };
    case "blur_expired":
      return { type: "focus_lost", timestamp: now };
    case "copy":
      return { type: "copy", timestamp: now };
    case "cut":
      return { type: "cut", timestamp: now };
    default:
      return null;
  }
}

interface UseAntiCheatingOptions {
  enabled: boolean;
  /** Proctoring mode: emit granular tab_switch/focus_lost/copy/cut instead
   *  of the coarse page_departure for those events. */
  proctoring?: boolean;
  onViolation?: (violation: AntiCheatingViolation) => void;
}

interface UseAntiCheatingResult {
  violations: AntiCheatingViolation[];
  departureCount: number;
  multiScreenDetected: boolean;
}

export function useAntiCheating({
  enabled,
  proctoring = false,
  onViolation,
}: UseAntiCheatingOptions): UseAntiCheatingResult {
  const [violations, setViolations] = useState<AntiCheatingViolation[]>([]);
  const [departureCount, setDepartureCount] = useState(0);
  const [multiScreenDetected, setMultiScreenDetected] = useState(false);
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  const addViolation = useCallback((violation: AntiCheatingViolation) => {
    setViolations((prev) => [...prev, violation]);
    onViolationRef.current?.(violation);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const recordDeparture = () => {
      setDepartureCount((prev) => prev + 1);
      addViolation({
        type: "page_departure",
        timestamp: Date.now(),
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = null;
        }
        const proctored = proctoring
          ? mapProctoringViolation("visibility_hidden", Date.now())
          : null;
        if (proctored) {
          addViolation(proctored);
          return;
        }
        recordDeparture();
      }
    };

    const handleBlur = () => {
      blurTimer = setTimeout(() => {
        blurTimer = null;
        // focus returned before the timer fired (e.g. clicking the browser's
        // mic/camera permission prompt) — a transient blur, not a departure
        if (document.hasFocus()) return;
        const proctored = proctoring
          ? mapProctoringViolation("blur_expired", Date.now())
          : null;
        if (proctored) {
          addViolation(proctored);
          return;
        }
        recordDeparture();
      }, 200);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled, proctoring, addViolation]);

  useEffect(() => {
    if (!enabled) return;

    const internalCopies = new Set<string>();

    const trackText = (text: string | undefined | null) => {
      const trimmed = text?.trim();
      if (trimmed) internalCopies.add(trimmed);
    };

    const getSelectionText = (): string => {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel) return sel;
      const el = document.activeElement;
      if (
        (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) &&
        el.selectionStart != null &&
        el.selectionEnd != null
      ) {
        return el.value.substring(el.selectionStart, el.selectionEnd).trim();
      }
      return "";
    };

    const handleCopy = (e: ClipboardEvent) => {
      trackText(getSelectionText());
      trackText(e.clipboardData?.getData("text/plain"));
      if (proctoring) {
        const proctored = mapProctoringViolation(e.type === "cut" ? "cut" : "copy", Date.now());
        if (proctored) addViolation(proctored);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const pastedText = e.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (!pastedText || internalCopies.has(pastedText)) return;
      e.preventDefault();
      e.stopPropagation();
      addViolation({
        type: "paste",
        timestamp: Date.now(),
        detail: "External content pasted",
      });
    };

    // Intercept DataTransfer.setData to catch editors (e.g. Monaco) that
    // write selected text via clipboardData.setData() in their own copy/cut
    // handlers, which run after our capture-phase listener.
    const origSetData = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (format: string, data: string) {
      if (format === "text/plain" || format === "text") trackText(data);
      return origSetData.call(this, format, data);
    };

    // Also intercept Clipboard API writeText for editors that bypass
    // DOM copy events entirely.
    const origWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (origWriteText) {
      navigator.clipboard.writeText = (text: string) => {
        trackText(text);
        return origWriteText(text);
      };
    }

    document.addEventListener("copy", handleCopy, true);
    document.addEventListener("cut", handleCopy, true);
    document.addEventListener("paste", handlePaste, true);

    return () => {
      DataTransfer.prototype.setData = origSetData;
      if (origWriteText) navigator.clipboard.writeText = origWriteText;
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("cut", handleCopy, true);
      document.removeEventListener("paste", handlePaste, true);
    };
  }, [enabled, proctoring, addViolation]);

  useEffect(() => {
    if (!enabled) return;

    const checkScreens = () => {
      if (typeof window === "undefined") return;

      const screen = window.screen as Screen & { availLeft?: number };
      const hasMultiple =
        screen.availWidth > screen.width ||
        (screen.availLeft !== undefined && screen.availLeft !== 0);

      if (hasMultiple && !multiScreenDetected) {
        setMultiScreenDetected(true);
        addViolation({
          type: "multi_screen",
          timestamp: Date.now(),
          detail: `Multiple screens detected (${window.screen.availWidth}x${window.screen.availHeight})`,
        });
      }
    };

    const screenDetails = (window as unknown as { getScreenDetails?: () => Promise<{ screens: unknown[] }> })
      .getScreenDetails;
    if (screenDetails) {
      screenDetails()
        .then((details) => {
          if (details.screens.length > 1) {
            setMultiScreenDetected(true);
            addViolation({
              type: "multi_screen",
              timestamp: Date.now(),
              detail: `${details.screens.length} screens detected via Screen API`,
            });
          }
        })
        .catch(() => {
          checkScreens();
        });
    } else {
      checkScreens();
    }

    const interval = setInterval(checkScreens, 10000);
    return () => clearInterval(interval);
  }, [enabled, multiScreenDetected, addViolation]);

  return { violations, departureCount, multiScreenDetected };
}
