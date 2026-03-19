# Kanban Bridge Skill

This OpenClaw skill creates tasks on the OpenClawBoard Kanban board from channel messages (Telegram, WhatsApp, Discord, Slack, etc.).

## Setup

1. In OpenClawBoard Settings, generate a **Webhook Token**
2. Copy the skill file to your OpenClaw workspace skills directory:
   ```bash
   cp skills/kanban-bridge.md ~/.openclaw/workspace/skills/
   ```
3. Set the environment variable with your webhook token:
   ```bash
   export OPENCLAWBOARD_WEBHOOK_TOKEN="your_token_here"
   ```
4. Or configure in your OpenClaw skill config:
   ```json
   {
     "openclawboard_url": "http://localhost:3333",
     "openclawboard_token": "your_token_here"
   }
   ```

## How It Works

When a user sends a message via any configured channel (Telegram, WhatsApp, etc.) that starts with `/task` or contains a task-like request, this skill:

1. Parses the message into a task title, description, and priority
2. POSTs it to the OpenClawBoard webhook endpoint
3. Optionally auto-dispatches the task to an agent

## Message Format

Users can create tasks from any channel with:

```
/task Fix the login page redirect bug
/task [high] Deploy the new API version
/task [low] Update the README with new examples
```

The priority is optional and defaults to `medium`. Valid priorities: `low`, `medium`, `high`, `critical`.

## API Endpoint

```
POST http://localhost:3333/api/webhook/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Task title",
  "description": "Optional longer description",
  "priority": "medium",
  "channel": "telegram",
  "sender": "username",
  "autoDispatch": false
}
```

### Response

```json
{
  "task": {
    "id": "abc123",
    "title": "Task title",
    "status": "todo",
    ...
  }
}
```

If `autoDispatch: true`, the task is immediately assigned to an OpenClaw agent for execution.
