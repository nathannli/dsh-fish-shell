# dsh-fish-shell

# do not use. it simply causes more retries due to syntax rewrites

A DeepSeek Harness (DSH) profile plugin that runs commands submitted through the model-facing `bash` tool with Fish instead:

```text
bash tool call → fish -c <command>
```

The public tool remains named `bash` so its existing schema, presentation, sandbox approval, output, timeout, and background-job contracts remain intact. The plugin adds a system-prompt note instructing the agent to use Fish-compatible syntax.

It updates both foreground and background commands. When DSH mounts its sandboxing shell executor, it also changes the inner confined command from `bash -c` to `fish -c`. Persistent PTY terminal sessions are not changed.

When configured with [Babelfish](https://github.com/bouk/babelfish), it preprocesses commands containing standalone Bash assignments before Fish runs them. For example, `NAME=value`, `export NAME=value`, and `NAME=$(command)` become Fish `set` commands. Fish-native commands are left unchanged. Babelfish failures stop the tool call instead of executing untranslated Bash.

## Dependency

Bash-assignment translation depends on [Babelfish](https://github.com/bouk/babelfish). It is optional: omit `babelfishPath` to run Fish directly without Bash translation.

## Configuration

By default, the plugin uses `$SHELL` when it ends in `/fish`; otherwise it runs `fish` from `PATH`. On this system `$SHELL` is `/opt/homebrew/bin/fish`, so the default resolves to that absolute path.

Set explicit executable paths in the profile patch if needed:

```yaml
- id: fish-shell
  config:
    fishPath: /opt/homebrew/bin/fish
    babelfishPath: /opt/homebrew/bin/babelfish
```

`babelfishPath` is optional. Without it, the plugin runs Fish directly and does not rewrite Bash syntax. Install Babelfish with `brew install babelfish`.

This is deliberately not a general Bash compatibility layer. Complex Bash syntax, inline environment assignments such as `NAME=value command`, and semantics Babelfish cannot translate should be written directly in Fish.

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
