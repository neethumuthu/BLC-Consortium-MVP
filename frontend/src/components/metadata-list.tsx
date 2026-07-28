function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function MetadataList({ metadata }: { metadata?: Record<string, unknown> }) {
  const entries = metadata ? Object.entries(metadata) : [];
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <span className="text-muted-foreground">{key}</span>
          <span>{formatValue(value)}</span>
        </div>
      ))}
    </div>
  );
}
