/**
 * Client-side code execution for CODING interview questions.
 *
 * JavaScript/TypeScript run inside a sandboxed Web Worker (the browser's
 * own origin isolation); TypeScript is transpiled with the installed
 * `typescript` package (lazy-loaded chunk) before execution. Python runs
 * in a worker backed by Pyodide loaded from CDN on first use. A run that
 * exceeds its time budget has its worker terminated.
 *
 * shortcut: this sandbox is the candidate's own browser, not a hardened
 * runtime — it only needs to survive honest interview usage. Upgrade to a
 * server-side runner (e.g. self-hosted Piston) for hostile untrusted code.
 */

export type RunStream = "stdout" | "stderr";

export interface RunLine {
  stream: RunStream;
  line: string;
}

export interface RunResult {
  lines: RunLine[];
  timedOut?: boolean;
}

export const RUNNABLE_LANGUAGES = ["javascript", "typescript", "python"];

export function canRunLanguage(language: string): boolean {
  return RUNNABLE_LANGUAGES.includes(language);
}

const JS_RUN_TIMEOUT_MS = 5_000;
const PY_RUN_TIMEOUT_MS = 8_000;
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";

const JS_WORKER_SOURCE = `
self.onmessage = function (e) {
  function fmt(v) {
    if (typeof v === "string") return v;
    try { return JSON.stringify(v) ?? String(v); } catch (err) { return String(v); }
  }
  function write(stream, args) {
    self.postMessage({ stream: stream, line: Array.prototype.map.call(args, fmt).join(" ") });
  }
  console.log = function () { write("stdout", arguments); };
  console.info = console.log;
  console.warn = function () { write("stderr", arguments); };
  console.error = console.warn;
  try {
    var result = (0, eval)(e.data.code);
    if (result !== undefined) write("stdout", [result]);
  } catch (err) {
    self.postMessage({ stream: "stderr", line: err && err.stack ? err.stack : String(err) });
  }
  self.postMessage({ done: true });
};
`;

const PY_WORKER_SOURCE = `
importScripts("${PYODIDE_URL}");
var readyPromise = null;
function getPy() {
  if (!readyPromise) {
    self.postMessage({ event: "loading" });
    readyPromise = loadPyodide({
      stdout: function (s) { self.postMessage({ stream: "stdout", line: s }); },
      stderr: function (s) { self.postMessage({ stream: "stderr", line: s }); },
    }).then(function (py) {
      self.postMessage({ event: "ready" });
      return py;
    });
  }
  return readyPromise;
}
self.onmessage = async function (e) {
  try {
    var py = await getPy();
    await py.runPythonAsync(e.data.code);
  } catch (err) {
    self.postMessage({ stream: "stderr", line: String(err) });
  }
  self.postMessage({ done: true });
};
`;

function makeBlobWorker(source: string): Worker {
  return new Worker(
    URL.createObjectURL(new Blob([source], { type: "application/javascript" })),
  );
}

async function transpileTs(code: string): Promise<string> {
  const ts = await import("typescript");
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      // shortcut: ES modules are kept as-is because eval() in the worker
      // cannot resolve import statements — candidate snippets are plain
      // scripts; a candidate using imports sees a runtime error and can
      // inline the dependency instead.
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
}

async function runJs(
  code: string,
  transpile: boolean,
  onLine?: (line: RunLine) => void,
): Promise<RunResult> {
  const finalCode = transpile ? await transpileTs(code) : code;
  const worker = makeBlobWorker(JS_WORKER_SOURCE);
  const lines: RunLine[] = [];
  return new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ lines, timedOut: true });
    }, JS_RUN_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { stream?: RunStream; line?: string; done?: boolean };
      if (msg.stream && typeof msg.line === "string") {
        const line = { stream: msg.stream, line: msg.line };
        lines.push(line);
        onLine?.(line);
      }
      if (msg.done) {
        clearTimeout(timer);
        worker.terminate();
        resolve({ lines });
      }
    };
    worker.onerror = (e: ErrorEvent) => {
      const line = { stream: "stderr" as const, line: e.message || "Worker error" };
      lines.push(line);
      onLine?.(line);
    };
    worker.postMessage({ code: finalCode });
  });
}

// Pyodide's runtime download is expensive, so its worker persists across runs.
let pyWorker: Worker | null = null;
let pyMessageHandler: ((msg: Record<string, unknown>) => void) | null = null;

function ensurePyWorker(): Worker {
  if (pyWorker) return pyWorker;
  pyWorker = makeBlobWorker(PY_WORKER_SOURCE);
  pyWorker.onmessage = (e: MessageEvent) => {
    pyMessageHandler?.(e.data as Record<string, unknown>);
  };
  pyWorker.onerror = (e: ErrorEvent) => {
    pyMessageHandler?.({ stream: "stderr", line: e.message || "Python worker error" });
  };
  return pyWorker;
}

async function runPy(
  code: string,
  onLine?: (line: RunLine) => void,
): Promise<RunResult> {
  const worker = ensurePyWorker();
  const lines: RunLine[] = [];
  return new Promise<RunResult>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (timedOut: boolean) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        // A terminated worker cannot run again — drop it so the next run
        // starts a fresh one (runtime re-load is acceptable after a hang).
        worker.terminate();
        pyWorker = null;
      }
      pyMessageHandler = null;
      resolve({ lines, timedOut });
    };
    pyMessageHandler = (msg) => {
      if (msg.event === "loading") {
        const line = { stream: "stdout" as const, line: "Loading Python runtime… (first run only)" };
        lines.push(line);
        onLine?.(line);
        return;
      }
      if (msg.event === "ready") {
        // Timeout starts only once the runtime is up, so slow first loads
        // are not mistaken for a hanging program.
        timer = setTimeout(() => finish(true), PY_RUN_TIMEOUT_MS);
        return;
      }
      if (msg.stream && typeof msg.line === "string") {
        const line = { stream: msg.stream as RunStream, line: msg.line };
        lines.push(line);
        onLine?.(line);
        return;
      }
      if (msg.done) finish(false);
    };
    worker.postMessage({ code });
  });
}

let running = false;

/** Execute code in the browser. Throws for non-runnable languages. */
export async function runCode(
  code: string,
  language: string,
  onLine?: (line: RunLine) => void,
): Promise<RunResult> {
  if (!canRunLanguage(language)) {
    throw new Error(`Language "${language}" cannot run in the browser`);
  }
  if (running) {
    throw new Error("A run is already in progress");
  }
  running = true;
  try {
    switch (language) {
      case "javascript":
        return await runJs(code, false, onLine);
      case "typescript":
        return await runJs(code, true, onLine);
      default:
        return await runPy(code, onLine);
    }
  } finally {
    running = false;
  }
}

const CHAT_SNIPPET_MAX_CHARS = 2_000;

/** Serialize a finished run for the AI interviewer's context, capped in size. */
export function summarizeRunForChat(
  result: RunResult,
  language: string,
): { language: string; ok: boolean; stdout: string; stderr: string } {
  const stdout = result.lines
    .filter((l) => l.stream === "stdout")
    .map((l) => l.line)
    .join("\n")
    .slice(0, CHAT_SNIPPET_MAX_CHARS);
  const stderr = result.lines
    .filter((l) => l.stream === "stderr")
    .map((l) => l.line)
    .join("\n")
    .slice(0, CHAT_SNIPPET_MAX_CHARS);
  return { language, ok: !result.timedOut && !stderr, stdout, stderr };
}
