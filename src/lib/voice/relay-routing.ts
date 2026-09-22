export type RelayKind = "voice";

export interface RelayTarget {
  kind: RelayKind;
  url: string;
}

export interface RelayUrlOptions {
  language?: string;
  voiceRelayUrl?: string;
  browserProtocol?: string;
  browserHost?: string;
}

export interface RelaySocketLike {
  readyState: number;
  binaryType?: string;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface RelayMessageContext<TJsonMessage extends Record<string, unknown>> {
  target: RelayTarget;
  isFailover: boolean;
  connector: RelayConnector<TJsonMessage>;
}

interface RelayConnectedContext {
  target: RelayTarget;
  isFailover: boolean;
  connector: RelayConnector<Record<string, unknown>>;
}

interface RelayFailoverContext {
  from: RelayTarget;
  to: RelayTarget;
  reason: string;
}

interface RelayConnectorOptions<TJsonMessage extends Record<string, unknown>> {
  targets: RelayTarget[];
  buildInitMessage: () => unknown;
  createSocket?: (url: string) => RelaySocketLike;
  readyTimeoutMs?: number;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
  binaryType?: string;
  onJsonMessage: (
    message: TJsonMessage,
    context: RelayMessageContext<TJsonMessage>
  ) => void;
  onBinaryMessage?: (
    data: ArrayBuffer,
    context: RelayMessageContext<TJsonMessage>
  ) => void;
  onConnected?: (context: RelayConnectedContext) => void;
  onReconnecting?: (attempt: number, maxAttempts: number, target: RelayTarget) => void;
  onFailover?: (context: RelayFailoverContext) => void;
  onPermanentFailure?: (error: Error) => void;
}

const DEFAULT_VOICE_RELAY_PORT = "8766";
const DEFAULT_VOICE_RELAY_PATH = "/ws/voice";
const READY_STATE_OPEN = 1;

export function isChineseVoiceLanguage(language?: string): boolean {
  if (!language) return false;
  const normalized = language.trim().toLowerCase();
  return (
    normalized === "zh" ||
    normalized.startsWith("zh-") ||
    normalized.includes("chinese") ||
    normalized.includes("中文")
  );
}

function deriveUrlFromBrowser(
  browserProtocol?: string,
  browserHost?: string,
  port?: string,
  pathname = DEFAULT_VOICE_RELAY_PATH
): string | null {
  if (!browserProtocol || !browserHost) return null;
  try {
    const protocol = browserProtocol === "https:" ? "wss:" : "ws:";
    const url = new URL(`${protocol}//${browserHost}${pathname}`);
    if (port) url.port = port;
    return url.toString();
  } catch {
    return null;
  }
}

function isLocalBrowserHost(browserHost?: string): boolean {
  if (!browserHost) return false;
  const normalized = browserHost.replace(/:\d+$/, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

export function resolveRelayUrls(options: RelayUrlOptions): {
  voiceRelayUrl: string;
} {
  const shouldUseSameOriginProxy =
    !!options.browserProtocol &&
    !!options.browserHost &&
    !isLocalBrowserHost(options.browserHost);

  const voiceRelayUrl =
    options.voiceRelayUrl ||
    (shouldUseSameOriginProxy
      ? deriveUrlFromBrowser(
          options.browserProtocol,
          options.browserHost,
          undefined,
          DEFAULT_VOICE_RELAY_PATH
        )
      : null) ||
    deriveUrlFromBrowser(
      options.browserProtocol,
      options.browserHost,
      DEFAULT_VOICE_RELAY_PORT,
      DEFAULT_VOICE_RELAY_PATH
    ) ||
    `ws://localhost:${DEFAULT_VOICE_RELAY_PORT}`;

  return { voiceRelayUrl };
}

export function buildRelayTargets(options: RelayUrlOptions): RelayTarget[] {
  const { voiceRelayUrl } = resolveRelayUrls(options);
  return [{ kind: "voice", url: voiceRelayUrl }];
}

export function relayDisplayName(): string {
  return "voice relay";
}

export function isRecoverableRelayErrorMessage(message?: string): boolean {
  if (!message) return false;
  return /(connection failed|connect timeout|websocket error|disconnected|timeout|failed to connect|mic test failed)/i.test(
    message
  );
}

function normalizeBinaryData(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength
    ) as ArrayBuffer;
  }
  return null;
}

export class RelayConnector<TJsonMessage extends Record<string, unknown>> {
  private readonly targets: RelayTarget[];
  private readonly buildInitMessage: () => unknown;
  private readonly createSocket: (url: string) => RelaySocketLike;
  private readonly readyTimeoutMs: number;
  private readonly reconnectAttempts: number;
  private readonly reconnectDelayMs: number;
  private readonly binaryType?: string;
  private readonly onJsonMessage: RelayConnectorOptions<TJsonMessage>["onJsonMessage"];
  private readonly onBinaryMessage: RelayConnectorOptions<TJsonMessage>["onBinaryMessage"];
  private readonly onConnected?: RelayConnectorOptions<TJsonMessage>["onConnected"];
  private readonly onReconnecting?: RelayConnectorOptions<TJsonMessage>["onReconnecting"];
  private readonly onFailover?: RelayConnectorOptions<TJsonMessage>["onFailover"];
  private readonly onPermanentFailure?: RelayConnectorOptions<TJsonMessage>["onPermanentFailure"];

  private socket: RelaySocketLike | null = null;
  private currentIndex = -1;
  private currentTarget: RelayTarget | null = null;
  private ready = false;
  private destroyed = false;
  private failoverPromise: Promise<RelayTarget> | null = null;
  private attemptSerial = 0;

  constructor(options: RelayConnectorOptions<TJsonMessage>) {
    this.targets = options.targets;
    this.buildInitMessage = options.buildInitMessage;
    this.createSocket =
      options.createSocket ||
      ((url: string) => new WebSocket(url) as unknown as RelaySocketLike);
    this.readyTimeoutMs = options.readyTimeoutMs ?? 10_000;
    this.reconnectAttempts = options.reconnectAttempts ?? 2;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1500;
    this.binaryType = options.binaryType;
    this.onJsonMessage = options.onJsonMessage;
    this.onBinaryMessage = options.onBinaryMessage;
    this.onConnected = options.onConnected;
    this.onReconnecting = options.onReconnecting;
    this.onFailover = options.onFailover;
    this.onPermanentFailure = options.onPermanentFailure;
  }

  get target(): RelayTarget | null {
    return this.currentTarget;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get canFailover(): boolean {
    return this.targets.length > 1;
  }

  async connect(): Promise<RelayTarget> {
    this.destroyed = false;
    return this.connectCandidates(
      this.targets.map((_, index) => index),
      false
    );
  }

  async failover(reason: string): Promise<RelayTarget | null> {
    if (this.destroyed || this.currentIndex < 0) {
      return null;
    }
    if (this.failoverPromise) return this.failoverPromise;

    const from = this.currentTarget;
    const disconnectedIndex = this.currentIndex;

    this.ready = false;
    const activeSocket = this.socket;
    this.socket = null;
    if (activeSocket) {
      try {
        activeSocket.close();
      } catch {
        // noop
      }
    }

    this.failoverPromise = this.reconnectThenFailover(
      disconnectedIndex,
      from,
      reason,
    ).finally(() => {
      this.failoverPromise = null;
    });

    return this.failoverPromise;
  }

  /** Try reconnecting to the same target first; only failover to
   *  alternatives if all reconnect attempts are exhausted. */
  private async reconnectThenFailover(
    disconnectedIndex: number,
    from: RelayTarget | null,
    reason: string,
  ): Promise<RelayTarget> {
    // Attempt reconnection to the same target
    for (let attempt = 1; attempt <= this.reconnectAttempts; attempt++) {
      if (this.destroyed) break;

      const delay = this.reconnectDelayMs * attempt;
      this.onReconnecting?.(attempt, this.reconnectAttempts, this.targets[disconnectedIndex]);
      await new Promise((r) => setTimeout(r, delay));

      if (this.destroyed) break;

      try {
        const target = await this.connectCandidate(disconnectedIndex, false);
        return target;
      } catch {
        // retry
      }
    }

    // All reconnect attempts exhausted — fall through to alternative targets
    if (this.destroyed) throw new Error("Connector destroyed during reconnect");

    if (this.targets.length < 2) {
      const err = new Error("Voice relay reconnect failed — no alternative targets");
      this.onPermanentFailure?.(err);
      throw err;
    }

    const candidateIndices = this.targets
      .map((_, index) => index)
      .filter((index) => index !== disconnectedIndex);

    return this.connectCandidates(
      candidateIndices,
      true,
      from ?? undefined,
      reason
    );
  }

  sendJson(payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== READY_STATE_OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  close(): void {
    this.destroyed = true;
    this.ready = false;
    const activeSocket = this.socket;
    this.socket = null;
    if (!activeSocket) return;
    try {
      activeSocket.close();
    } catch {
      // noop
    }
  }

  private async connectCandidates(
    candidateIndices: number[],
    isFailover: boolean,
    from?: RelayTarget,
    reason?: string
  ): Promise<RelayTarget> {
    let lastError: Error | null = null;

    for (const index of candidateIndices) {
      try {
        const target = await this.connectCandidate(index, isFailover);
        if (isFailover && from && from.url !== target.url) {
          this.onFailover?.({ from, to: target, reason: reason || "relay failover" });
        }
        return target;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));
      }
    }

    const finalError =
      lastError || new Error("All voice relay targets failed");
    this.onPermanentFailure?.(finalError);
    throw finalError;
  }

  private connectCandidate(
    index: number,
    isFailover: boolean
  ): Promise<RelayTarget> {
    const target = this.targets[index];
    const attemptId = ++this.attemptSerial;

    return new Promise<RelayTarget>((resolve, reject) => {
      const socket = this.createSocket(target.url);
      if (this.binaryType) {
        socket.binaryType = this.binaryType;
      }

      this.socket = socket;
      this.currentIndex = index;
      this.currentTarget = target;
      this.ready = false;

      let settled = false;
      const timer = setTimeout(() => {
        try {
          socket.close();
        } catch {
          // noop
        }
        if (!settled) {
          settled = true;
          reject(new Error(`${relayDisplayName()} timed out before ready`));
        }
      }, this.readyTimeoutMs);

      const clear = () => clearTimeout(timer);

      socket.onopen = () => {
        if (this.destroyed || attemptId !== this.attemptSerial) return;
        socket.send(JSON.stringify(this.buildInitMessage()));
      };

      socket.onmessage = (event) => {
        if (this.destroyed) return;
        if (socket !== this.socket || attemptId !== this.attemptSerial) return;

        const binary = normalizeBinaryData(event.data);
        if (binary) {
          this.onBinaryMessage?.(binary, {
            target,
            isFailover,
            connector: this,
          });
          return;
        }

        if (typeof event.data !== "string") return;

        let message: TJsonMessage;
        try {
          message = JSON.parse(event.data) as TJsonMessage;
        } catch {
          return;
        }

        if (message.type === "ready" && !this.ready) {
          this.ready = true;
          clear();
          if (!settled) {
            settled = true;
            this.onConnected?.({
              target,
              isFailover,
              connector: this as unknown as RelayConnector<Record<string, unknown>>,
            });
            resolve(target);
          }
        }

        this.onJsonMessage(message, {
          target,
          isFailover,
          connector: this,
        });
      };

      socket.onerror = () => {
        if (settled || this.destroyed || this.ready) return;
        clear();
        settled = true;
        reject(new Error(`${relayDisplayName()} websocket error`));
      };

      socket.onclose = () => {
        clear();
        if (this.destroyed) return;

        if (!this.ready) {
          if (!settled) {
            settled = true;
            reject(new Error(`${relayDisplayName()} closed before ready`));
          }
          return;
        }

        if (socket !== this.socket) return;
        this.socket = null;
        this.ready = false;
        void this.failover(`${relayDisplayName()} disconnected`).catch(() => {
          // onPermanentFailure already handles the user-facing surface
        });
      };
    });
  }
}
