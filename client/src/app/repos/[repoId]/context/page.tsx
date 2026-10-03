import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (Project Context). Thin route entry — the view
   and its styles live under _components/ProjectContextView. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
