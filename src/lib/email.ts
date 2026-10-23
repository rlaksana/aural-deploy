import { Resend } from "resend";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/email");

/**
 * Transactional email via Resend. When RESEND_API_KEY/RESEND_FROM are not
 * configured (local dev, pre-launch) the invite flow degrades gracefully:
 * the link is logged and the UI shows a copyable invite URL instead.
 */
export function isEmailConfigured(): boolean {
  return (
    !!process.env.RESEND_API_KEY?.trim() && !!process.env.RESEND_FROM?.trim()
  );
}

type InviteCopy = {
  subject: (interviewTitle: string) => string;
  heading: string;
  body: (interviewTitle: string, positionTitle?: string) => string;
  cta: string;
};

const INVITE_COPY: Record<"id" | "en", InviteCopy> = {
  id: {
    subject: (t) => `Undangan Wawancara: ${t}`,
    heading: "Undangan Wawancara",
    body: (interviewTitle, positionTitle) =>
      `Anda diundang untuk mengikuti wawancara${
        positionTitle ? ` untuk posisi ${positionTitle}` : ""
      } "${interviewTitle}". Klik tautan di bawah untuk memulai — wawancara dapat dikerjakan dari browser, kapan saja sesuai batas waktu yang berlaku.`,
    cta: "Mulai Wawancara",
  },
  en: {
    subject: (t) => `Interview Invitation: ${t}`,
    heading: "Interview Invitation",
    body: (interviewTitle, positionTitle) =>
      `You are invited to complete an interview${
        positionTitle ? ` for the ${positionTitle} position` : ""
      } "${interviewTitle}". Click the link below to start — the interview runs in your browser.`,
    cta: "Start Interview",
  },
};

export async function sendInterviewInvite(opts: {
  to: string;
  candidateName: string;
  interviewTitle: string;
  positionTitle?: string;
  inviteUrl: string;
  /** interviews.language — zh falls back to en. */
  language?: string | null;
}): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    log.info(
      `Email not configured (set RESEND_API_KEY/RESEND_FROM); invite link for ${opts.to}: ${opts.inviteUrl}`,
    );
    return { sent: false };
  }

  const lang: "id" | "en" = opts.language === "en" ? "en" : "id";
  const copy = INVITE_COPY[lang];
  const greeting =
    lang === "id"
      ? `Halo ${opts.candidateName},`
      : `Hello ${opts.candidateName},`;

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 12px">${copy.heading}</h2>
  <p style="margin:0 0 16px;line-height:1.6">${greeting} ${copy.body(opts.interviewTitle, opts.positionTitle)}</p>
  <p style="margin:0 0 24px">
    <a href="${opts.inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">${copy.cta}</a>
  </p>
  <p style="margin:0;font-size:13px;color:#666;line-height:1.5">
    ${lang === "id" ? "Jika tombol tidak berfungsi, salin tautan berikut ke browser:" : "If the button does not work, copy this link into your browser:"}<br/>
    <a href="${opts.inviteUrl}">${opts.inviteUrl}</a>
  </p>
</div>`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: opts.to,
    subject: copy.subject(opts.interviewTitle),
    html,
  });

  if (error) {
    log.error(`Resend send failed for ${opts.to}`, error);
    return { sent: false };
  }
  return { sent: true };
}
