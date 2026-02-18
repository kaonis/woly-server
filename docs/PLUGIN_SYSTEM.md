# CNC Plugin System

The CNC backend supports a lightweight plugin runtime for third-party integrations.

## Configuration

Use `CNC_PLUGINS` to enable plugins by ID.

```bash
CNC_PLUGINS=webhook
```

- Value is a comma-separated list.
- Unknown plugin IDs are skipped with a warning.
- Default: `webhook`.

## Runtime Design

- `PluginEventBridge` normalizes internal host/node events and publishes them to `PluginEventBus`.
- `PluginManager` loads enabled plugin IDs and manages lifecycle (`init`/`destroy`).
- Plugins subscribe to `PluginEventBus` and react to events.

## Plugin Contract

```ts
interface WolyPlugin {
  readonly name: string;
  readonly version: string;
  init(context: PluginContext): Promise<void> | void;
  destroy(): Promise<void> | void;
}

interface PluginContext {
  eventBus: PluginEventBus;
}
```

## Built-in Reference Plugin

`webhook` is the reference plugin. It subscribes to plugin events and dispatches webhook deliveries for:

- `host.discovered`
- `host.removed`
- `host.awake`
- `host.asleep`
- `node.connected`
- `node.disconnected`
- `scan.complete`

This provides a baseline implementation that external plugins can follow.
