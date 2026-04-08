import { ChatWorkspace } from "./ChatWorkspace";
import { getConnectorStatuses } from "@/src/connectors/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const connectors = await getConnectorStatuses();

  return <ChatWorkspace connectors={connectors} />;
}
