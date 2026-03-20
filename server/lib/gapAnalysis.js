/**
 * Gap analysis rules and connector mapping for cross-provider compatibility checks.
 * Extracted from the Claude Desktop exporter for reuse in AgentCare insights.
 */

export const GAP_RULES = [
  {
    category: 'push-notification',
    test: (content) => /\bmessage\b.*\b(telegram|discord|slack|whatsapp|signal)\b/i.test(content) ||
      /\bdeliver(y|ed)?\b/i.test(content),
    severity: 'medium',
    description: 'Uses messaging channels (Telegram, Discord, etc.) for delivery. Not all providers support push notifications natively.',
    workaround: 'Use a connector (Slack, Notion, etc.) to send summaries, or check results manually in the provider\'s UI.',
  },
  {
    category: 'model-routing',
    test: (content, item) => {
      const model = item.platforms?.openclaw?.model;
      return !!model;
    },
    severity: 'low',
    description: 'Configured for a specific model. Other providers may use a different default model.',
    workaround: 'Select your preferred model in the target provider\'s settings.',
  },
  {
    category: 'skill-chaining',
    test: (content) => /\bread\s+.*skill/i.test(content) && /\bthen\b.*\bread\b/i.test(content),
    severity: 'high',
    description: 'Chains multiple skills together. Not all providers support explicit skill chaining.',
    workaround: 'Inline the chained steps into a single skill file, or rely on multi-step workflows.',
  },
  {
    category: 'custom-binary',
    test: (content) => /\bpython3?\b|\bnode\b|\bnpm\b|\bbash\b/i.test(content) &&
      /\b(run|exec|execute|spawn)\b/i.test(content),
    severity: 'medium',
    description: 'Executes custom scripts or binaries. Requires the tools to be installed on the host machine.',
    workaround: 'Ensure required tools (Python, Node, etc.) are installed and accessible.',
  },
  {
    category: 'high-frequency',
    test: (content, item) => {
      const cron = item.schedule?.cron;
      if (!cron) return false;
      const parts = cron.split(' ');
      return parts[0]?.includes('/') && parts[1] === '*';
    },
    severity: 'medium',
    description: 'Runs at high frequency (sub-hourly). Some providers only support hourly minimum.',
    workaround: 'Adjust frequency to hourly, or use a provider that supports sub-hourly scheduling.',
  },
  {
    category: 'gateway-config',
    test: (content) => /\bgateway\b|\bwebhook\b|\bport\b.*\blisten/i.test(content),
    severity: 'low',
    description: 'Uses gateway/webhook configuration. Local providers don\'t need gateway setup.',
    workaround: 'Remove gateway references for local providers.',
  },
  {
    category: 'memory-plugin',
    test: (content) => /\bmemory\b.*\b(store|save|read|load)\b/i.test(content) ||
      /\b\.json\b.*\bstate\b/i.test(content),
    severity: 'low',
    description: 'Uses structured memory/state files. State persistence varies by provider.',
    workaround: 'Use local filesystem or provider-specific memory features (e.g., CLAUDE.md).',
  },
  {
    category: 'env-vars',
    test: (content) => /\benv\b|\bAPI_KEY\b|\bTOKEN\b|\bSECRET\b/i.test(content),
    severity: 'low',
    description: 'Uses environment variables. Ensure they are set in the target provider\'s environment.',
    workaround: 'Set required environment variables in your shell profile or provider config.',
  },
];

export const CONNECTOR_MAP = [
  { pattern: /\bnotion\b/i, tool: 'Notion (via API/MCP)', connector: 'Notion connector', status: 'direct-match' },
  { pattern: /\bgmail\b|\bemail\b|\binbox\b/i, tool: 'Gmail (via API)', connector: 'Gmail connector', status: 'direct-match' },
  { pattern: /\bslack\b/i, tool: 'Slack (via API/channel)', connector: 'Slack connector', status: 'direct-match' },
  { pattern: /\bgoogle\s*calendar\b|\bcalendar\b/i, tool: 'Google Calendar (via API)', connector: 'Google Calendar connector', status: 'direct-match' },
  { pattern: /\bgoogle\s*drive\b|\bdrive\b/i, tool: 'Google Drive (via API)', connector: 'Google Drive connector', status: 'direct-match' },
  { pattern: /\blinear\b/i, tool: 'Linear (via API)', connector: 'Linear connector', status: 'direct-match' },
  { pattern: /\bgithub\b/i, tool: 'GitHub (via API/CLI)', connector: 'GitHub (via gh CLI)', status: 'direct-match' },
];

/**
 * Analyze an item for cross-provider compatibility gaps.
 * @param {object} item — registry item
 * @param {string} skillContent — optional skill markdown content
 * @returns {{ readiness: string, gaps: Array, connectors: Array }}
 */
export function analyzeGaps(item, skillContent) {
  const fullText = (skillContent || '') + ' ' + (item.description || '');
  const gaps = [];

  for (const rule of GAP_RULES) {
    if (rule.test(fullText, item)) {
      gaps.push({
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
        workaround: rule.workaround,
      });
    }
  }

  const connectors = CONNECTOR_MAP
    .filter(c => c.pattern.test(fullText))
    .map(c => ({
      tool: c.tool,
      connector: c.connector,
      status: c.status,
    }));

  const highCount = gaps.filter(g => g.severity === 'high').length;
  const medCount = gaps.filter(g => g.severity === 'medium').length;
  const readiness = highCount > 0 ? 'blocked' : medCount > 0 ? 'partial' : 'ready';

  return { readiness, gaps, connectors };
}
