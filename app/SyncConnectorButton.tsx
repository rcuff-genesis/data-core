"use client";

import { useEffect, useState } from "react";

type SyncMode = "full" | "incremental";

interface SyncResponse {
  ok: boolean;
  error?: string;
  result?: {
    connector: string;
    mode: SyncMode;
    recordsFetched: number;
    recordsMapped: number;
    syncRunId?: number;
    sourceRecordsPersisted?: number;
    entitiesPersisted?: number;
    relationsPersisted?: number;
    warnings: string[];
  };
}

export function SyncConnectorButton({
  connector,
  label,
}: {
  connector: string;
  label: string;
}) {
  const isWalnut = connector === "walnut";
  const [activeMode, setActiveMode] = useState<SyncMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!syncStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - syncStartedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [syncStartedAt]);

  async function handleSync(mode: SyncMode) {
    setActiveMode(mode);
    setMessage(null);
    setWarnings([]);
    setSyncStartedAt(Date.now());

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connector,
          mode,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as SyncResponse;

      if (!response.ok || !payload.ok) {
        setMessage(payload.error ?? `${label} ${mode} sync failed.`);
        return;
      }

      const completedMode = payload.result?.mode ?? mode;
      setMessage(
        `${isWalnut ? `${label} import` : labelForMode(completedMode)} finished. Fetched ${payload.result?.recordsFetched ?? 0} records, mapped ${payload.result?.recordsMapped ?? 0} entities, persisted ${payload.result?.entitiesPersisted ?? 0} entities and ${payload.result?.relationsPersisted ?? 0} relations.`,
      );
      setWarnings(payload.result?.warnings ?? []);
    } catch {
      setMessage(`${label} ${isWalnut ? "import" : `${mode} sync`} request failed.`);
    } finally {
      setActiveMode(null);
      setSyncStartedAt(null);
    }
  }

  const isSyncing = activeMode !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {!isWalnut ? (
          <button
            type="button"
            onClick={() => handleSync("incremental")}
            disabled={isSyncing}
            className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {activeMode === "incremental"
              ? "Syncing Incremental..."
              : "Incremental Sync"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => handleSync("full")}
          disabled={isSyncing}
          className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {activeMode === "full"
            ? isWalnut
              ? "Importing Walnut..."
              : "Syncing Full..."
            : isWalnut
              ? "Import Walnut"
              : "Full Sync"}
        </button>
      </div>

      {message && !isSyncing ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
          {message}
        </p>
      ) : null}

      {isSyncing ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
          {isWalnut ? "Walnut import" : `${labelForMode(activeMode ?? "full")}`} is still running.
          {elapsedSeconds > 0 ? ` Elapsed: ${elapsedSeconds}s.` : ""}
          {elapsedSeconds >= 20
            ? " Large syncs can take a while, especially full imports."
            : ""}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function labelForMode(mode: SyncMode): string {
  return mode === "full" ? "Full sync" : "Incremental sync";
}
