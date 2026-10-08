import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

export const cases: SkillCase[] = [
  {
    name: "review: names the ring violations in a widgets module",
    kind: "quality",
    prompt:
      "Review this new `widgets` backend module against this repo's architecture rules. " +
      "Go through both files and list every architectural violation you find. For each one write a full sentence " +
      "naming the offending code, the rule it breaks (with the ring or file the rule refers to), and where the code should live instead.\n\n" +
      "```ts\n" +
      fx("widgets-routes.ts") +
      "\n```\n\n```ts\n" +
      fx("widgets-service.ts") +
      "\n```",
    practices: [
      "Names `platform/container.ts` (and/or `app.ts`) as the only place allowed to construct (`new`) a concrete adapter, in connection with `new OpenAILlmProvider` in the service.",
      "Says the Drizzle query / `drizzle-orm` import in the `GET /widgets` route handler belongs in the repository.",
      "Says the service importing `WidgetRow` from `db/rows` is a problem (a persistence row type in the application ring) and that a DTO should be returned instead.",
    ],
  },
  {
    name: "review: hand-rolled 404 in widgets route",
    kind: "quality",
    prompt:
      "In this repo, how should the `GET /widgets/:id` handler below report a missing widget? " +
      "Say what to change and which module provides the replacement.\n\n```ts\n" +
      fx("widgets-routes.ts") +
      "\n```",
    practices: [
      "Says to throw `NotFoundError` (from `platform/errors`) instead of hand-rolling `reply.code(404).send(...)`.",
      "Says the error handler in `app.ts` turns the thrown error into the `ApiErrorBody` envelope.",
    ],
  },
  {
    name: "negative: clean labels module is not flagged",
    kind: "quality",
    prompt:
      "Review this `labels` backend module against this repo's architecture rules. " +
      "Report only genuine architectural violations. If there are none, say so plainly.\n\n```ts\n" +
      fx("labels-clean.ts") +
      "\n```",
    practices: [
      "Concludes that the module is clean, for example by saying there are no violations or that it follows the architecture rules.",
      "Does not claim that `new LabelService(new LabelRepository(db))` in `container.ts` is a violation; it treats the container as the allowed place to construct it, or does not mention it as a problem.",
      "Does not claim that the repository importing `drizzle-orm` or `db/schema` is a violation.",
    ],
  },
];
