import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const relayPath = path.join(
  fileURLToPath(new URL("../server/voice-relay.ts", import.meta.url)),
);

function readVoiceRelaySource(): string {
  return fs.readFileSync(relayPath, "utf8");
}

describe("server/voice-relay.ts lifecycle (source checks)", () => {
  it("routes all speech through the one-shot MiniMax ASR pipeline", () => {
    const src = readVoiceRelaySource();
    assert.ok(src.includes("transcribePcm("));
    assert.ok(src.includes("enqueueTranscription("));
    assert.ok(src.includes('"barge_in"'));
    assert.doesNotMatch(src, /new WebSocket\(BIGMODEL_ASR_URL/);
  });

  it("installs a 10s safety timeout after farewell audio is queued", () => {
    const src = readVoiceRelaySource();
    assert.ok(
      src.includes(
        "Farewell TTS timed out after 10s — forcing interview end",
      ),
    );
    assert.match(
      src,
      /setTimeout\(\(\) => \{[\s\S]*?endInterview\(\);[\s\S]*?\}, 10_000\);/,
    );
  });
});
