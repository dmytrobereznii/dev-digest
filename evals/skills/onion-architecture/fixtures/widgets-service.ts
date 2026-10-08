// server/src/modules/widgets/service.ts
import type { Container } from "../../platform/container.js";
import { NotFoundError } from "../../platform/errors.js";
import type { LLMProvider } from "../../vendor/shared/adapters.js";
import { OpenAILlmProvider } from "../../adapters/llm/openai.js";
import type { WidgetRow } from "../../db/rows.js";
import { WidgetRepository } from "./repository.js";

export class WidgetService {
  private readonly repo: WidgetRepository;
  private readonly llm: LLMProvider;

  constructor(private readonly container: Container) {
    this.repo = new WidgetRepository(container.db);
    this.llm = new OpenAILlmProvider({ apiKey: process.env.OPENAI_API_KEY ?? "" });
  }

  async get(id: string): Promise<WidgetRow | null> {
    return this.repo.findById(id);
  }

  async create(name: string, repoId: string): Promise<WidgetRow> {
    const summary = await this.llm.complete({
      model: "gpt-4o-mini",
      prompt: `Write a one-line description for a widget called ${name}`,
    });
    const row = await this.repo.insert({ name, repoId, description: summary.text });
    if (!row) throw new NotFoundError("repo", repoId);
    return row;
  }
}
