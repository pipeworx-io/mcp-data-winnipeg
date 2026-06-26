interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Winnipeg Open Data (data.winnipeg.ca) Socrata MCP.
 *
 * Winnipeg Open Data — US/Canada government open data (data.winnipeg.ca) via the Socrata SoQL API: Winnipeg, Canada — assessment, transit, permits & city services. Keyless.
 * Use `datasets` (catalog search) -> `metadata` (schema) -> `query` (SoQL).
 */


const BASE = 'https://data.winnipeg.ca';
const UA = 'pipeworx-mcp-data-winnipeg/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'datasets',
    description: 'Search the Winnipeg Open Data catalog of open datasets by keyword. Returns each dataset\'s resource_id, name, description, category and update date — pass the resource_id to query/metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search dataset titles/descriptions (e.g. "budget", "crime", "health").' },
        limit: { type: 'number', description: 'Max datasets (1-100, default 20).' },
        offset: { type: 'number', description: 'Pagination offset.' },
      },
    },
  },
  {
    name: 'query',
    description: 'Run a Socrata SoQL query against a Winnipeg Open Data dataset by resource_id (e.g. "d4mq-wa44"). Filter with where/select/group/order (SoQL clauses, without the leading $) plus limit/offset. Returns matching rows as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        resource_id: { type: 'string', description: 'Dataset id, e.g. "d4mq-wa44" (from datasets).' },
        where: { type: 'string', description: 'SoQL $where filter, e.g. "year >= 2020 AND status = \'Active\'".' },
        select: { type: 'string', description: 'SoQL $select, e.g. "name, count(*) AS n".' },
        group: { type: 'string', description: 'SoQL $group column(s).' },
        order: { type: 'string', description: 'SoQL $order, e.g. "date DESC".' },
        limit: { type: 'number', description: 'Max rows (default Socrata 1000).' },
        offset: { type: 'number', description: 'Pagination offset.' },
      },
      required: ['resource_id'],
    },
  },
  {
    name: 'metadata',
    description: 'Get a Winnipeg Open Data dataset\'s schema + metadata (columns, types, row count, category, last-updated) by resource_id, e.g. "d4mq-wa44".',
    inputSchema: {
      type: 'object',
      properties: { resource_id: { type: 'string', description: 'Dataset id, e.g. "d4mq-wa44".' } },
      required: ['resource_id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'datasets': {
      const p = new URLSearchParams({
        limit: String(Math.min(100, Math.max(1, (args.limit as number) ?? 20))),
        offset: String(Math.max(0, (args.offset as number) ?? 0)),
        domains: 'data.winnipeg.ca',
      });
      if (args.query) p.set('q', String(args.query));
      const res = await fetch(`https://api.us.socrata.com/api/catalog/v1?${p}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (!res.ok) throw new Error(`Socrata catalog: ${res.status}`);
      return res.json();
    }
    case 'query': {
      const id = reqStr(args, 'resource_id', '"d4mq-wa44"');
      const p = new URLSearchParams();
      for (const k of ['where', 'select', 'group', 'order'] as const) {
        if (args[k]) p.set(`$${k}`, String(args[k]));
      }
      if (args.limit != null) p.set('$limit', String(args.limit));
      if (args.offset != null) p.set('$offset', String(args.offset));
      return socrataGet(`/resource/${id}.json?${p}`);
    }
    case 'metadata':
      return socrataGet(`/api/views/${reqStr(args, 'resource_id', '"d4mq-wa44"')}.json`);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function socrataGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`data.winnipeg.ca: ${res.status}`);
  return res.json();
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing. Pass a string like ${example}.`);
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
