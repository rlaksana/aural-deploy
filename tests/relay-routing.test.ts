import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelayTargets,
  RelayConnector,
  type RelaySocketLike,
  resolveRelayUrls,
} from "../src/lib/voice/relay-routing";

class FakeSocket implements RelaySocketLike {
  readyState = 0;
  binaryType?: string;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emitJson(data: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emitError(): void {
    this.onerror?.();
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await flush();
  }
}

test("buildRelayTargets returns the single voice relay target for every language", () => {
  for (const language of ["zh-CN", "English", "en"]) {
    const targets = buildRelayTargets({
      language,
      voiceRelayUrl: "ws://voice-relay:8766",
    });
    assert.deepEqual(targets, [{ kind: "voice", url: "ws://voice-relay:8766" }]);
  }
});

test("Production browser defaults use a same-origin relay path instead of the raw relay port", () => {
  const targets = buildRelayTargets({
    language: "en",
    browserProtocol: "https:",
    browserHost: "aural-ai.com",
  });

  assert.deepEqual(targets, [{ kind: "voice", url: "wss://aural-ai.com/ws/voice" }]);
});

test("resolveRelayUrls honors an explicitly configured voice relay URL", () => {
  const urls = resolveRelayUrls({
    voiceRelayUrl: "wss://aural-ai.com/ws/voice",
  });

  assert.equal(urls.voiceRelayUrl, "wss://aural-ai.com/ws/voice");
});

test("RelayConnector retries the same relay and reports permanent failure when reconnects exhaust", async () => {
  const sockets: FakeSocket[] = [];
  const reconnects: number[] = [];
  let permanentFailure: Error | null = null;

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [{ kind: "voice", url: "ws://voice-primary:8766" }],
    reconnectAttempts: 2,
    reconnectDelayMs: 1,
    buildInitMessage: () => ({ type: "init" }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onReconnecting: (attempt) => {
      reconnects.push(attempt);
    },
    onPermanentFailure: (error) => {
      permanentFailure = error;
    },
  });

  const connectPromise = connector.connect();
  sockets[0].emitOpen();
  await flush();
  sockets[0].emitJson({ type: "ready" });
  await connectPromise;
  assert.equal(connector.target?.kind, "voice");

  // Mid-session disconnect — both reconnect attempts hit the same single target and fail
  sockets[0].emitClose();

  await waitFor(() => sockets.length >= 2, 2_000);
  sockets[1].emitClose();
  await waitFor(() => sockets.length >= 3, 2_000);
  sockets[2].emitClose();

  await waitFor(() => permanentFailure !== null, 2_000);
  assert.match(String(permanentFailure), /no alternative targets/);
  assert.equal(reconnects.length, 2);
});

test("RelayConnector reconnects to the same relay successfully without failover", async () => {
  const sockets: FakeSocket[] = [];
  const failovers: Array<{ from: string; to: string }> = [];

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [{ kind: "voice", url: "ws://voice-primary:8766" }],
    reconnectAttempts: 2,
    reconnectDelayMs: 1,
    buildInitMessage: () => ({ type: "init" }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onFailover: ({ from, to }) => {
      failovers.push({ from: from.kind, to: to.kind });
    },
  });

  const connectPromise = connector.connect();
  sockets[0].emitOpen();
  await flush();
  sockets[0].emitJson({ type: "ready" });
  await connectPromise;

  // Mid-session disconnect
  sockets[0].emitClose();

  // Reconnect attempt 1 succeeds — same target, no failover
  await waitFor(() => sockets.length >= 2, 2_000);
  assert.equal(sockets[1].url, "ws://voice-primary:8766");
  sockets[1].emitOpen();
  await flush();
  sockets[1].emitJson({ type: "ready" });
  await flush();

  assert.equal(connector.target?.kind, "voice");
  assert.equal(connector.isReady, true);
  assert.equal(failovers.length, 0);
});

test("RelayConnector reports permanent failure when the only target fails to connect", async () => {
  const sockets: FakeSocket[] = [];
  let permanentFailure: Error | null = null;

  const connector = new RelayConnector<Record<string, unknown>>({
    targets: [{ kind: "voice", url: "ws://voice-primary:8766" }],
    buildInitMessage: () => ({ type: "init" }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onJsonMessage: () => {},
    onPermanentFailure: (error) => {
      permanentFailure = error;
    },
  });

  const connectPromise = connector.connect();
  sockets[0].emitError();

  await assert.rejects(connectPromise);
  assert.ok(permanentFailure);
});
