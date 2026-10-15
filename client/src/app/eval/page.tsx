import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (the Eval Dashboard, all agents). Thin route entry — the view,
   its styles and constants are colocated under _components/EvalDashboardView. */
export default function EvalDashboardPage() {
  return <EvalDashboardView />;
}
