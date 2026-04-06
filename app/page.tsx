import { getConnectorStatuses } from "@/src/connectors/catalog";

export const dynamic = "force-dynamic";

const stateStyles = {
  connected: {
    badge: "bg-emerald-100 text-emerald-700",
    panel: "border-emerald-200 bg-emerald-50/70",
  },
  ready_to_connect: {
    badge: "bg-amber-100 text-amber-700",
    panel: "border-amber-200 bg-amber-50/70",
  },
  not_configured: {
    badge: "bg-rose-100 text-rose-700",
    panel: "border-rose-200 bg-rose-50/70",
  },
  coming_soon: {
    badge: "bg-stone-200 text-stone-700",
    panel: "border-stone-200 bg-stone-50",
  },
} as const;

const stateLabels = {
  connected: "Connected",
  ready_to_connect: "Ready To Connect",
  not_configured: "Needs Setup",
  coming_soon: "Coming Soon",
} as const;

export default async function Home() {
  const connectors = await getConnectorStatuses();
  const connectedCount = connectors.filter(
    (connector) => connector.state === "connected",
  ).length;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f5f4_0%,#fafaf9_45%,#ffffff_100%)] px-6 py-16 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="rounded-[2rem] border border-stone-200 bg-white/90 p-8 shadow-[0_30px_80px_-40px_rgba(28,25,23,0.3)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                Data Core
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Connector control plane for your shared data layer.
              </h1>
              <p className="text-base leading-7 text-stone-600 sm:text-lg">
                This project is now acting like a backend host. Connect sources
                here, normalize them through the ontology, and expose internal
                tool functions to the rest of your app.
              </p>
            </div>

            <div className="grid min-w-[220px] gap-3 rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <p className="text-sm text-stone-500">Current connector state</p>
              <p className="text-4xl font-semibold tracking-tight">
                {connectedCount}/{connectors.length}
              </p>
              <p className="text-sm leading-6 text-stone-600">
                connected right now. Zoho is the first live path; OneDrive and
                Supabase are staged next.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {connectors.map((connector) => {
            const styles = stateStyles[connector.state];

            return (
              <article
                key={connector.key}
                className={`flex min-h-[280px] flex-col justify-between rounded-[1.75rem] border p-6 shadow-sm ${styles.panel}`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
                        {connector.category}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                        {connector.name}
                      </h2>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${styles.badge}`}
                    >
                      {stateLabels[connector.state]}
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-stone-700">
                    {connector.description}
                  </p>
                  <p className="text-sm leading-6 text-stone-600">
                    {connector.message}
                  </p>
                  {connector.details ? (
                    <p className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm leading-6 text-stone-600">
                      {connector.details}
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {connector.actionHref ? (
                    <a
                      href={connector.actionHref}
                      className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-700"
                    >
                      {connector.actionLabel}
                    </a>
                  ) : null}
                  {connector.key === "zoho" && connector.state === "connected" ? (
                    <form action="/api/sync" method="post">
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                      >
                        Sync Zoho
                      </button>
                    </form>
                  ) : null}
                  <a
                    href="/api/health"
                    className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 px-5 text-sm font-medium text-stone-700 transition hover:bg-white"
                  >
                    Health
                  </a>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 text-sm leading-7 text-stone-600 shadow-sm">
          <p>
            After connecting Zoho, use <span className="font-mono">POST /api/sync</span>{" "}
            to trigger a backend sync. The current implementation fetches live
            records from Zoho CRM modules and maps them into the internal
            ontology.
          </p>
        </section>
      </div>
    </main>
  );
}
