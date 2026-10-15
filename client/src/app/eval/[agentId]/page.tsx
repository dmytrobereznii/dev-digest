/* Route: /eval/:agentId — one agent's eval view. Thin entry: the view, its
   trend chart and compare modal live under _components/AgentEvalView. */
"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AgentEvalView } from "./_components/AgentEvalView";

export default function AgentEvalPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Eval Dashboard", href: "/eval" }, { label: "Agent" }]}>
      <AgentEvalView agentId={agentId} />
    </AppShell>
  );
}
