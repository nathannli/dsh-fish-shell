# dsh-fish-shell

A DeepSeek Harness (DSH) profile plugin that runs commands submitted through the model-facing `bash` tool with Fish instead:

```text
bash tool call → fish -c <command>
```

The public tool remains named `bash` so its existing schema, presentation, sandbox approval, output, timeout, and background-job contracts remain intact. The plugin adds a system-prompt note instructing the agent to use Fish-compatible syntax.

It updates both foreground and background commands. When DSH mounts its sandboxing shell executor, it also changes the inner confined command from `bash -c` to `fish -c`. Persistent PTY terminal sessions are not changed.

## Configuration

By default, the plugin uses `$SHELL` when it ends in `/fish`; otherwise it runs `fish` from `PATH`. On this system `$SHELL` is `/opt/homebrew/bin/fish`, so the default resolves to that absolute path.

Set an explicit executable path in the profile patch if needed:

```yaml
- id: fish-shell
  config:
    fishPath: /opt/homebrew/bin/fish
```

## Install

From this repository:

```bash
dsh plugin --profile web add "$PWD"
```

Restart the DSH host after installation. A restart is required because this is a server-side shell-executor plugin; client-plugin HMR does not reload it.

To remove it:

```bash
dsh plugin --profile web remove dsh-fish-shell
```

## Test

```bash
npm test
```

## Compatibility

Tested against DSH `0.1.0-rc.6`. The plugin requires DSH's local bash-compatible shell executor (`runArgv` and `startArgv`).

## License

MIT
