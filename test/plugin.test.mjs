import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, inject, name, shouldTranslateBash, translateBash } from '../index.mjs'

function harness({ sandbox } = {}) {
  const calls = []
  const shell = {
    ctx: { sandbox },
    runArgv(spec, argv) {
      calls.push({ kind: 'run', spec, argv })
      return { spec, argv }
    },
    startArgv(spec, argv) {
      calls.push({ kind: 'start', spec, argv })
      return { spec, argv }
    },
  }
  if (sandbox !== undefined) {
    shell.confine = function confine(command, policy) {
      return this.ctx.sandbox.confine(['bash', '-c', command], policy)
    }
  }
  const sections = []
  let disposer
  const ctx = {
    get(service) {
      if (service === 'shell') return shell
      if (service === 'sandbox') return sandbox
    },
    systemPrompt: { section(section) { sections.push(section) } },
    effect(factory) { disposer = factory() },
  }
  return { calls, ctx, dispose: () => disposer(), sections, shell }
}

describe('fish-shell', () => {
  it('exports a Cordis plugin with its required services', () => {
    assert.equal(name, 'fish-shell')
    assert.deepEqual(inject, ['shell', 'systemPrompt'])
  })

  it('detects standalone Bash assignments but leaves Fish-native syntax alone', () => {
    assert.equal(shouldTranslateBash('NAME=value'), true)
    assert.equal(shouldTranslateBash('export REGION=ca-central-1'), true)
    assert.equal(shouldTranslateBash('echo ok; VALUE=$(command)'), true)
    assert.equal(shouldTranslateBash('set name value'), false)
    assert.equal(shouldTranslateBash('if functions -q makeemr\n  echo loaded\nend'), false)
  })

  it('translates detected Bash assignments through Babelfish', () => {
    const calls = []
    const spawn = (...args) => {
      calls.push(args)
      return { error: undefined, signal: null, status: 0, stderr: '', stdout: "set NAME 'value'\n" }
    }

    assert.equal(translateBash('NAME=value', '/opt/homebrew/bin/babelfish', spawn), "set NAME 'value'\n")
    assert.deepEqual(calls, [[
      '/opt/homebrew/bin/babelfish',
      [],
      { encoding: 'utf8', input: 'NAME=value', maxBuffer: 1024 * 1024, timeout: 5_000 },
    ]])
    assert.equal(translateBash('set name value', '/opt/homebrew/bin/babelfish', spawn), 'set name value')
  })

  it('reports Babelfish failures instead of running untranslated Bash', () => {
    assert.throws(
      () => translateBash('NAME=value', 'babelfish', () => ({ error: undefined, signal: null, status: 1, stderr: 'unsupported syntax', stdout: '' })),
      /Babelfish translation failed: unsupported syntax/,
    )
  })

  it('uses Fish for foreground and background local shell argv', () => {
    const test = harness()
    apply(test.ctx, { fishPath: '/opt/homebrew/bin/fish' })

    test.shell.runArgv({ command: 'echo $argv' }, ['bash', '-c', 'echo $argv'])
    test.shell.startArgv({ command: 'echo $argv' }, ['bash', '-c', 'echo $argv'])

    assert.deepEqual(test.calls, [
      { kind: 'run', spec: { command: 'echo $argv' }, argv: ['/opt/homebrew/bin/fish', '-c', 'echo $argv'] },
      { kind: 'start', spec: { command: 'echo $argv' }, argv: ['/opt/homebrew/bin/fish', '-c', 'echo $argv'] },
    ])
    assert.match(test.sections[0].text, /Fish-compatible syntax/)
  })

  it('preserves argv that are not the executor bash boundary', () => {
    const test = harness()
    apply(test.ctx, { fishPath: 'fish' })
    const argv = ['sandbox-runner', '--', 'bash', '-c', 'echo safe']

    test.shell.runArgv({}, argv)

    assert.equal(test.calls[0].argv, argv)
  })

  it('uses Fish inside sandbox confinement', () => {
    const sandboxCalls = []
    const sandbox = {
      confine(argv, policy) {
        sandboxCalls.push({ argv, policy })
        return { argv: ['sandbox-runner', ...argv] }
      },
    }
    const test = harness({ sandbox })
    apply(test.ctx, { fishPath: '/opt/homebrew/bin/fish' })

    assert.deepEqual(test.shell.confine('echo $version', { mode: 'workspace-write' }), {
      argv: ['sandbox-runner', '/opt/homebrew/bin/fish', '-c', 'echo $version'],
    })
    assert.deepEqual(sandboxCalls, [{
      argv: ['/opt/homebrew/bin/fish', '-c', 'echo $version'],
      policy: { mode: 'workspace-write' },
    }])
  })

  it('restores exact methods and leaves captured wrappers inert on disposal', () => {
    const test = harness()
    const originalRunArgv = test.shell.runArgv
    const originalStartArgv = test.shell.startArgv
    apply(test.ctx, { fishPath: 'fish' })
    const capturedRunArgv = test.shell.runArgv

    test.dispose()

    assert.equal(test.shell.runArgv, originalRunArgv)
    assert.equal(test.shell.startArgv, originalStartArgv)
    capturedRunArgv({}, ['bash', '-c', 'echo bash'])
    assert.deepEqual(test.calls[0].argv, ['bash', '-c', 'echo bash'])
  })

  it('rejects invalid configuration and unsupported shell executors', () => {
    const invalid = harness()
    assert.throws(() => apply(invalid.ctx, { fishPath: '' }), /fishPath must be a non-empty string/)

    const invalidBabelfish = harness()
    assert.throws(() => apply(invalidBabelfish.ctx, { babelfishPath: '' }), /babelfishPath must be a non-empty string/)

    const unsupported = harness()
    delete unsupported.shell.runArgv
    assert.throws(() => apply(unsupported.ctx), /requires a local bash-compatible shell executor/)
  })
})
