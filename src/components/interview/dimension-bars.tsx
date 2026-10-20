/**
 * Dimension profile bars for psychometric sessions. Pure presentational
 * (server-component safe): reads insights.dimensionScores (0-100) and
 * insights.bands. Renders nothing for non-psychometric sessions, so mounts
 * need no conditionals. Bands are rule-based screening heuristics — the
 * caption says so, never "clinical norms".
 */

type DimRow = { label: string; score: number; band: string | null };

function toRows(scores: unknown, bands: unknown): DimRow[] {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return [];
  const bandMap =
    bands && typeof bands === "object" && !Array.isArray(bands)
      ? (bands as Record<string, unknown>)
      : {};
  return Object.entries(scores as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v as number))
    .map(([key, v]) => ({
      label: key
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      score: Math.max(0, Math.min(100, v as number)),
      band: typeof bandMap[key] === "string" ? (bandMap[key] as string) : null,
    }));
}

export function DimensionBars({
  scores,
  bands,
}: {
  scores: unknown;
  bands?: unknown;
}) {
  const rows = toRows(scores, bands);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      {rows.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm font-medium">
            {d.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${d.score}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
            {Math.round(d.score)}
          </span>
          {d.band && (
            <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
              {d.band}
            </span>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Rule-based interpretation for screening — not clinical norms.
      </p>
    </div>
  );
}
