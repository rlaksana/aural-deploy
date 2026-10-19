import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sessionTokenValid } from "@/lib/session-access";
import { NextResponse } from "next/server";

const log = createLogger("api/session/upload");

/**
 * Upload a file (audio recording or screenshot) to Supabase Storage.
 *
 * Expects multipart FormData with:
 *   - file: Blob/File
 *   - sessionId: string
 *   - type: "recording" | "screenshot"
 *   - filename: string (optional, used as the storage path suffix)
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const sessionId = formData.get("sessionId") as string | null;
    const type = formData.get("type") as string | null;
    const filename = formData.get("filename") as string | null;
    const sessionToken = formData.get("sessionToken") as string | null;

    if (!file || !sessionId || !type) {
      return NextResponse.json(
        { error: "Missing required fields: file, sessionId, type" },
        { status: 400 },
      );
    }

    if (!(await sessionTokenValid(supabaseAdmin, sessionId, sessionToken))) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 403 });
    }

    if (type !== "recording" && type !== "screenshot") {
      return NextResponse.json(
        { error: 'type must be "recording" or "screenshot"' },
        { status: 400 },
      );
    }

    const maxBytes = type === "recording" ? 500 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` },
        { status: 413 },
      );
    }

    // The session must exist — otherwise this endpoint is an open file host.
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .single();
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const bucket = type === "recording" ? "recordings" : "screenshots";
    const defaultExt = type === "recording"
      ? (file.type?.includes("mp4") || file.type?.includes("m4a") ? "m4a" : "webm")
      : "jpg";
    // Client-supplied name: strip anything path-like so it can never escape
    // the per-session prefix in the storage key.
    const safeName =
      (filename ?? "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") ||
      `${Date.now()}.${defaultExt}`;
    const storagePath = `${sessionId}/${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const defaultContentType = type === "recording"
      ? (file.type?.includes("mp4") ? "audio/mp4" : "audio/webm")
      : "image/jpeg";

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type || defaultContentType,
        upsert: false,
      });

    if (uploadError) {
      log.error("Storage error:", bucket, uploadError);
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 },
      );
    }

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

    if (signedError || !signedData?.signedUrl) {
      log.error("Signed URL error:", bucket, signedError);
      return NextResponse.json(
        { error: "Failed to generate signed URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      path: storagePath,
      bucket,
    });
  } catch (err) {
    log.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
