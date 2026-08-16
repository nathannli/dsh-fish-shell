/**
 * Runs DSH's model-facing `bash` tool through Fish without changing its
 * tool schema, output, job, timeout, or sandbox contracts.
 */

export const name = 'fish-shell'
export const inject = ['shell', 'systemPrompt']

const CORDIS_ORIGINAL = Symbol.for('cordis.original')
const INSTALLATION = Symbol.for('dsh-fish-shell.installation')

function defaultFishPath() {
  return process.env.SHELL?.endsWith('/fish') === true ? process.env.SHELL : 'fish'
}

function fishArgv(fishPath, command) {
  return [fishPath, '-c', command]
}

function replaceBashArgv(argv, fishPath) {
  if (!Array.isArray(argv) || argv.length !== 3 || argv[0] !== 'bash' || argv[1] !== '-c') return argv
  return fishArgv(fishPath, argv[2])
}

function restoreMethod(target, key, patched, original, hadOwn) {
  if (target[key] !== patched) return
  if (hadOwn) target[key] = original
  else delete target[key]
}

/**
 * Replace only the local executor's `bash -c` boundary and the sandbox
 * executor's inner command argv. The public tool intentionally remains named
 * `bash`, preserving the host's tool protocol and presentation integration.
 */
export const apply = (ctx, config = {}) => {
  const shellView = ctx.get('shell')
  const shell = shellView?.[CORDIS_ORIGINAL] ?? shellView
  const fishPath = config.fishPath ?? defaultFishPath()
  if (typeof fishPath !== 'string' || fishPath.length === 0) {
    throw new Error('fish-shell: fishPath must be a non-empty string')
  }
  if (shell === undefined || shell === null || typeof shell !== 'object') {
    throw new Error('fish-shell: requires the shell service')
  }
  if (shell[INSTALLATION] !== undefined) {
    throw new Error('fish-shell is already installed on this shell executor')
  }
  if (typeof shell.runArgv !== 'function' || typeof shell.startArgv !== 'function') {
    throw new Error('fish-shell: requires a local bash-compatible shell executor')
  }

  const originalRunArgv = shell.runArgv
  const originalStartArgv = shell.startArgv
  const originalConfine = typeof shell.confine === 'function' ? shell.confine : undefined
  const sandbox = originalConfine === undefined ? undefined : shell.ctx?.get?.('sandbox') ?? shell.ctx?.sandbox
  if (originalConfine !== undefined && (sandbox === undefined || typeof sandbox.confine !== 'function')) {
    throw new Error('fish-shell: sandbox executor exposes confine() without a sandbox service')
  }

  const hadOwnRunArgv = Object.hasOwn(shell, 'runArgv')
  const hadOwnStartArgv = Object.hasOwn(shell, 'startArgv')
  const hadOwnConfine = Object.hasOwn(shell, 'confine')
  const installation = { active: true }
  const patchedRunArgv = function patchedRunArgv(spec, argv) {
    return originalRunArgv.call(shell, spec, installation.active ? replaceBashArgv(argv, fishPath) : argv)
  }
  const patchedStartArgv = function patchedStartArgv(spec, argv) {
    return originalStartArgv.call(shell, spec, installation.active ? replaceBashArgv(argv, fishPath) : argv)
  }
  const patchedConfine = originalConfine === undefined ? undefined : function patchedConfine(command, policy) {
    if (!installation.active) return originalConfine.call(shell, command, policy)
    return sandbox.confine(fishArgv(fishPath, command), policy)
  }

  const dispose = () => {
    installation.active = false
    restoreMethod(shell, 'runArgv', patchedRunArgv, originalRunArgv, hadOwnRunArgv)
    restoreMethod(shell, 'startArgv', patchedStartArgv, originalStartArgv, hadOwnStartArgv)
    if (patchedConfine !== undefined) restoreMethod(shell, 'confine', patchedConfine, originalConfine, hadOwnConfine)
    if (shell[INSTALLATION] === installation) delete shell[INSTALLATION]
  }

  try {
    shell[INSTALLATION] = installation
    shell.runArgv = patchedRunArgv
    shell.startArgv = patchedStartArgv
    if (patchedConfine !== undefined) shell.confine = patchedConfine
    ctx.systemPrompt.section({
      name: 'tool:fish-shell',
      order: 106,
      text: `The \`bash\` tool executes commands with \`${fishPath} -c\`, so use Fish-compatible syntax rather than Bash-only syntax.`,
    })
    ctx.effect(() => dispose, 'fish shell executor teardown')
  } catch (error) {
    dispose()
    throw error
  }
}
