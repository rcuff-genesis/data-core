"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ConnectorStatus } from "@/src/connectors/catalog";
import { SyncConnectorButton } from "./SyncConnectorButton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChatRole = "user" | "assistant";

type ToolCallLogEntry = {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
};

type ChartSpec = {
  type: "bar" | "pie" | "line";
  title: string;
  labels: string[];
  values: number[];
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  toolCallLog?: ToolCallLogEntry[];
  chart?: ChartSpec;
};

type ChatApiResponse = {
  ok: boolean;
  error?: string;
  response?: {
    answer: string;
    toolCallLog: ToolCallLogEntry[];
    chart?: ChartSpec;
  };
};

const starterPrompts = [
  "List all open deals",
  "How many leads by stage?",
  "Show recent sync status",
];

const CHART_COLORS = [
  "#111111",
  "#f97316",
  "#10b981",
  "#3f3f46",
  "#0f766e",
  "#a16207",
];

export function ChatWorkspace({
  connectors,
}: {
  connectors: ConnectorStatus[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const connectedCount = connectors.filter(
    (connector) => connector.state === "connected",
  ).length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  function handleStarterPrompt(prompt: string) {
    setDraft(prompt);
    textareaRef.current?.focus();
  }

  async function handleSubmit() {
    const content = draft.trim();

    if (!content || isPending) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content },
    ];

    setMessages(nextMessages);
    setDraft("");
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as ChatApiResponse;

        if (!response.ok || !payload.ok || !payload.response) {
          setError(payload.error ?? "The assistant could not answer right now.");
          return;
        }

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: payload.response?.answer ?? "",
            toolCallLog: payload.response?.toolCallLog ?? [],
            chart: payload.response?.chart,
          },
        ]);
      } catch {
        setError("Could not reach the local Ollama server.");
      }
    });
  }

  return (
    <div className="flex h-screen flex-col bg-white text-black">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-black">
            data.core
          </span>
          <span className="hidden text-xs text-zinc-400 sm:block">
            Query your business graph for leads, deals, accounts, orders, and sync state.
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-zinc-400">
            {connectedCount}/{connectors.length} connected
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500 transition hover:border-zinc-400 hover:text-black"
            aria-label="Open connections"
          >
            <GridIcon />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
            <p className="font-mono text-xs text-zinc-400">
              Ask anything about your connected data.
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleStarterPrompt(prompt)}
                  className="rounded border border-zinc-200 px-3 py-1.5 font-mono text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-black"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex flex-col ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <span className="mb-1 font-mono text-[10px] text-zinc-400">
                  {message.role === "user" ? "you" : "data.core"}
                </span>

                <div
                  className={`w-full max-w-[92%] rounded px-4 py-3 text-sm leading-relaxed sm:max-w-[85%] ${
                    message.role === "user"
                      ? "bg-black text-white"
                      : "bg-zinc-50 text-black ring-1 ring-zinc-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {message.role === "assistant" && message.toolCallLog?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-200 pt-3">
                      {message.toolCallLog.map((entry, index) => (
                        <span
                          key={`${entry.tool}-${index}`}
                          className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500"
                        >
                          {entry.tool}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" && message.chart ? (
                    <div className="mt-4 border-t border-zinc-200 pt-4">
                      <DataChart spec={message.chart} />
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ))}

            {isPending ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-2"
              >
                <div className="flex items-center gap-1 rounded bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
                </div>
              </motion.div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <AnimatePresence>
            {error ? (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-2 font-mono text-xs text-red-500"
              >
                {error}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              rows={1}
              placeholder="Ask about your data..."
              className="flex-1 resize-none rounded border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-black outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              style={{ minHeight: "38px", maxHeight: "120px" }}
            />

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isPending || !draft.trim()}
              className="flex h-[38px] items-center justify-center rounded border border-zinc-900 bg-black px-4 font-mono text-xs text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "..." : "send"}
            </button>
          </div>

          <p className="mt-1.5 font-mono text-[10px] text-zinc-400">
            enter sends, shift+enter makes a newline, powered by llama3.1 and your Postgres ontology
          </p>
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.button
              key="backdrop"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/30"
              aria-label="Close"
            />

            <motion.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-sm flex-col overflow-y-auto border-l border-zinc-200 bg-white px-5 pb-6 pt-5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-black">
                  connectors
                </span>

                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-black"
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="mt-6 flex flex-col gap-4">
                {connectors.map((connector) => (
                  <div
                    key={connector.key}
                    className="rounded border border-zinc-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                          {connector.category}
                        </p>
                        <h3 className="mt-1 text-sm font-semibold text-black">
                          {connector.name}
                        </h3>
                      </div>

                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                          connector.state === "connected"
                            ? "bg-black text-white"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {connector.state === "connected"
                          ? "live"
                          : connector.state.replace("_", " ")}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                      {connector.message}
                    </p>

                    {connector.details ? (
                      <p className="mt-2 rounded bg-zinc-50 px-3 py-2 font-mono text-[11px] text-zinc-500">
                        {connector.details}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {connector.actionHref ? (
                        <a
                          href={connector.actionHref}
                          className="rounded border border-zinc-900 px-3 py-1.5 font-mono text-xs text-black transition hover:bg-black hover:text-white"
                        >
                          {connector.actionLabel}
                        </a>
                      ) : null}

                      {connector.state === "connected" ? (
                        <SyncConnectorButton
                          connector={connector.key}
                          label={connector.name}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}

                <div className="rounded border border-zinc-200 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                    api routes
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["/api/ontology/status", "status"],
                      ["/api/health", "health"],
                      ["/api/connectors/zoho/status", "zoho"],
                    ].map(([href, label]) => (
                      <a
                        key={href}
                        href={href}
                        className="rounded border border-zinc-200 px-3 py-1.5 font-mono text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-black"
                      >
                        {label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DataChart({ spec }: { spec: ChartSpec }) {
  const data = spec.labels.map((label, index) => ({
    label,
    value: spec.values[index] ?? 0,
  }));

  const maxLabelLength = Math.max(...spec.labels.map((label) => label.length), 0);
  const leftMargin = Math.min(Math.max(maxLabelLength * 6, 48), 136);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          {spec.title}
        </h4>

        <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
          {spec.type}
        </span>
      </div>

      <div className="h-64 w-full rounded border border-zinc-200 bg-white px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          {spec.type === "bar" ? (
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 10, left: leftMargin, bottom: 8 }}
            >
              <CartesianGrid stroke="#f4f4f5" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis
                dataKey="label"
                type="category"
                width={leftMargin}
                tick={{ fill: "#52525b", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "#fafafa" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
                }}
              />
              <Bar dataKey="value" fill="#111111" radius={[0, 6, 6, 0]} />
            </BarChart>
          ) : null}

          {spec.type === "line" ? (
            <LineChart
              data={data}
              margin={{ top: 8, right: 10, left: 10, bottom: 8 }}
            >
              <CartesianGrid stroke="#f4f4f5" />
              <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="value"
                name={spec.title}
                stroke="#111111"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f97316" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          ) : null}

          {spec.type === "pie" ? (
            <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={42}
                outerRadius={82}
                paddingAngle={2}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`${entry.label}-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : null}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <rect
        x="1"
        y="1"
        width="6"
        height="6"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="9"
        y="1"
        width="6"
        height="6"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="1"
        y="9"
        width="6"
        height="6"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="9"
        y="9"
        width="6"
        height="6"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M3 3l10 10M13 3L3 13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
