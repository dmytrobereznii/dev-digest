import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (the Conventions extractor). Thin route
   entry — the view, its cards, merge modal, styles, constants and helpers are
   colocated under _components/ConventionsView. The view reads :repoId through
   useParams, so this shell stays a Server Component. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
