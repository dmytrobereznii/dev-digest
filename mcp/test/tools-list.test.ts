import { describe, expect, it } from 'vitest';
import { connectTestServer } from './helpers/connect.js';
import { defaultRoutes } from './helpers/fake-api.js';

const EXPECTED_ORDER = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];

const EXPECTED_ANNOTATIONS: Record<string, Record<string, boolean>> = {
  list_agents: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run_agent_on_pr: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  get_findings: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_conventions: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  get_blast_radius: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// §6 budget: instructions <= 700, each description <= 450, all 5 <= 2000.
const INSTRUCTIONS_MAX = 700;
const DESCRIPTION_MAX = 450;
const ALL_DESCRIPTIONS_MAX = 2000;

interface JsonSchemaLike {
  type?: string;
  properties?: Record<string, JsonSchemaLike>;
}

describe('T1 — tools/list', () => {
  it('lists exactly the 5 tools, in registration order, with no list_repos/list_prs', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(EXPECTED_ORDER);
  });

  it('every tool has a title and the §6 annotations', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.title, `${tool.name} title`).toBeTruthy();
      expect(tool.annotations, `${tool.name} annotations`).toEqual(EXPECTED_ANNOTATIONS[tool.name]);
    }
  });

  it('no tool advertises an outputSchema (D15)', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.outputSchema, `${tool.name} outputSchema`).toBeUndefined();
    }
  });

  it('every input is flat — no object-typed property', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const schema = tool.inputSchema as JsonSchemaLike;
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        expect(prop.type, `${tool.name}.${key} is flat`).not.toBe('object');
      }
    }
  });

  it("pr_number's advertised JSON Schema type stays integer", async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const schema = tool.inputSchema as JsonSchemaLike;
      const prNumber = schema.properties?.pr_number;
      if (prNumber) {
        expect(prNumber.type, `${tool.name}.pr_number`).toBe('integer');
      }
    }
  });

  it('holds the character budgets', async () => {
    const { client } = await connectTestServer(defaultRoutes());
    const instructions = client.getInstructions();
    expect(instructions).toBeDefined();
    expect((instructions ?? '').length).toBeLessThanOrEqual(INSTRUCTIONS_MAX);

    const { tools } = await client.listTools();
    let total = 0;
    for (const tool of tools) {
      const length = (tool.description ?? '').length;
      expect(length, `${tool.name} description`).toBeLessThanOrEqual(DESCRIPTION_MAX);
      total += length;
    }
    expect(total).toBeLessThanOrEqual(ALL_DESCRIPTIONS_MAX);
  });
});
