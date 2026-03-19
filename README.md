# OpenClawBoard

Mission control dashboard for [OpenClaw](https://github.com/openclaw) - monitor agents, costs, cron jobs, and get AI-powered improvement suggestions.

## Quick Start

```bash
npx openclawboard
```

Then open `http://localhost:3333` in your browser.

## Options

```
openclawboard [options]

Options:
  -p, --port <number>       Port to run the dashboard on (default: 3333)
  -H, --host <address>      Host to bind to (default: 127.0.0.1)
  --no-auth                 Disable authentication
  --openclaw-dir <path>     Path to OpenClaw directory (default: ~/.openclaw)
  --data-dir <path>         Path to OpenClawBoard data directory (default: ~/.openclawboard)
  -V, --version             Output the version number
  -h, --help                Display help
```

## Features

- **Agent Monitoring** - Track all your AI agents, their sessions, and status
- **Cost Analytics** - Monitor spending and token usage with charts and breakdowns
- **Cron Manager** - View and manage scheduled jobs with a weekly timeline
- **Kanban Board** - Organize tasks with drag-and-drop columns
- **Activity Feed** - Real-time activity stream with heatmap visualization
- **Memory Browser** - Explore and edit agent memory files
- **File Browser** - Navigate your workspace files
- **Skills Manager** - Enable, disable, and create agent skills
- **AI Suggestions** - 3-tier AI-powered improvement suggestions
- **Terminal** - Built-in terminal for quick commands
- **Settings** - Theme, timezone, and configuration management

## Development

```bash
npm install
npm run dev
```

This starts both the Vite dev server (port 5173) and the Express backend (port 3333).

## License

MIT
