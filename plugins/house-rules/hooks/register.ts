import type { EngineInterface, PluginOptions, Register } from 'claude-code'

const DEFAULT_PREFIXES = 'claude,ai,bot,bots,copilot,cursor,codex,gpt,openai,anthropic,assistant,agent,llm,devin,project-thread'
const ALLOW_KEY = 'house-rules.allow-identity'

const AT_COMMAND = String.raw`(?:^|[;&|(]\s*)`
const ARG = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|]+)`
const NAME = String.raw`([^\s;&|'"]+)`
const END = String.raw`(?=[\s;&|'")]|$)`
const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, '$2')
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TYPE_PREFIX = /^(feat|fix|test|refactor|docs|chore)\//

type Rules = { blocked: RegExp; branchType: string }
type Identity = { email: string; names: string[]; githubLogin: string }

const list = (value: PluginOptions[string] | undefined) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(item => String(item).trim())
    .filter(Boolean)

function rulesFrom(options: PluginOptions): Rules {
  const prefixes = list(options.blockedBranchPrefixes ?? DEFAULT_PREFIXES).map(escapeRegExp)
  return {
    blocked: prefixes.length > 0 ? new RegExp(String.raw`^(${prefixes.join('|')})[/-]`, 'i') : /$^/,
    branchType: String(options.branchType ?? 'feat').replace(/\/+$/, '') || 'feat',
  }
}

async function identityFrom($: EngineInterface, options: PluginOptions): Promise<Identity> {
  const globalConfig = (key: string) =>
    $.process.run(['git', 'config', '--global', key]).then(r => (r.exitCode === 0 ? r.stdout.trim() : ''))
  const email = String(options.gitEmail ?? '').trim() || (await globalConfig('user.email'))
  const names = list(options.gitNames)
  return {
    email,
    names: names.length > 0 ? names : [await globalConfig('user.name')].filter(Boolean),
    githubLogin: String(options.githubLogin ?? '').trim(),
  }
}

const ATTRIBUTION = String.raw`(?:🤖\s*)?(?:co-authored-by:|generated-by:|assisted-by:|claude-session:|generated (?:with|by) \[?claude)`
const ATTRIBUTION_LINE = new RegExp(String.raw`^[ \t]*(?:${ATTRIBUTION}|[^\n]*claude\.ai/code/session)[^\n]*(?:\n|$)`, 'gim')
const ATTRIBUTION_ESCAPED = new RegExp(String.raw`(?:\\n)+${ATTRIBUTION}[^"'\\\n]*`, 'gi')
const ATTRIBUTION_FLAG = new RegExp(String.raw`\s+(?:-m|--message|--trailer)(?:=|\s+)(["'])${ATTRIBUTION}[^"']*\1`, 'gi')
const WRITES_MESSAGE = /\b(?:git\s+(?:[^;&|\n]*\s)?(?:commit|tag|notes|merge|cherry-pick|revert)|gh\s+(?:pr|issue|release)\s+(?:create|edit|comment|review|merge))\b/

const CREATES_BRANCH = [
  new RegExp(String.raw`\bgit\s+(?:checkout|switch)\s+(?:[^;&|\n]*?\s)?(?:-b|-B|-c|-C|--create|--force-create)(?:=|\s+)${NAME}${END}`, 'g'),
  new RegExp(String.raw`\bgit\s+branch\s+(?:-m|-M|--move|-c|-C|--copy)\s+(?:\S+\s+)?${NAME}${END}`, 'g'),
  new RegExp(String.raw`\bgit\s+branch\s+(?:(?:-f|--force|--track|--no-track)\s+)*(?!-)${NAME}${END}`, 'g'),
  new RegExp(String.raw`\bgit\s+worktree\s+add\s+(?:[^;&|\n]*?\s)?-[bB]\s+${NAME}${END}`, 'g'),
]

function publishedBranches(command: string, rules: Rules) {
  const refs: string[] = []
  for (const match of command.matchAll(/\bgit\s+push\b([^;&|\n]*)/g)) {
    for (const token of (match[1] ?? '').trim().split(/\s+/)) refs.push(unquote(token.split(':').pop() ?? '').replace(/[`,;)]+$/, ''))
  }
  for (const match of command.matchAll(/\bgh\s+pr\s+create\b[^;&|\n]*?--head(?:=|\s+)([^\s;&|]+)/g)) refs.push(unquote(match[1] ?? ''))
  return refs.filter(ref => rules.blocked.test(ref))
}


function suggestedName(branch: string, rules: Rules) {
  const rest = branch.replace(rules.blocked, '')
  return TYPE_PREFIX.test(rest) ? rest : `${rules.branchType}/${rest}`
}

function stripIdentityOverrides(command: string, email: string, notes: Set<string>) {
  return command
    .replace(new RegExp(String.raw`\s+-c\s+(?:(["'])user\.(?:name|email)=[^"']*\1|user\.(?:name|email)=${ARG})`, 'g'), () => {
      notes.add('removed a `-c user.*` identity override')
      return ''
    })
    .replace(new RegExp(String.raw`\bGIT_(?:AUTHOR|COMMITTER)_(?:NAME|EMAIL)=${ARG}\s+`, 'g'), () => {
      notes.add('removed a GIT_AUTHOR/COMMITTER env override')
      return ''
    })
    .replace(new RegExp(String.raw`\s+--author(?:=|\s+)${ARG}`, 'g'), match => {
      if (email && match.includes(email)) return match
      notes.add('removed an `--author` override')
      return ''
    })
}

function stripAttribution(command: string, notes: Set<string>) {
  if (!WRITES_MESSAGE.test(command)) return command

  const note = () => {
    notes.add('removed AI attribution / co-author trailers')
    return ''
  }

  const keepClosingQuote = (line: string) => {
    note()
    const quote = /["']+\s*$/.exec(line.replace(/\n$/, ''))?.[0] ?? ''
    return quote && line.endsWith('\n') ? `${quote}\n` : quote
  }

  return command.replace(ATTRIBUTION_FLAG, note).replace(ATTRIBUTION_ESCAPED, note).replace(ATTRIBUTION_LINE, keepClosingQuote)
}

function renameNewBranches(command: string, rules: Rules, notes: Set<string>) {
  const renames = new Map<string, string>()

  for (const pattern of CREATES_BRANCH) {
    for (const match of command.matchAll(pattern)) {
      const branch = match[1] ?? ''
      if (rules.blocked.test(branch)) renames.set(branch, suggestedName(branch, rules))
    }
  }

  let out = command
  for (const [from, to] of renames) {
    out = out.replace(new RegExp(String.raw`(?<=[\s:'"=/]|^)${escapeRegExp(from)}${END}`, 'g'), to)
    notes.add(`renamed branch \`${from}\` to \`${to}\``)
  }

  return out
}

function workingDir(command: string) {
  const gitDir = /\bgit\s+-C\s+("[^"]*"|'[^']*'|\S+)/.exec(command)
  if (gitDir) return unquote(gitDir[1] ?? '')

  const cds = [...command.matchAll(/(?:^|[;&|]\s*)cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)/g)]
  const last = cds.at(-1)?.[1]
  return last === undefined ? undefined : unquote(last)
}

export const register: Register = (on, options) => {
  const rules = rulesFrom(options)
  let identity: Identity | undefined
  let verifiedLogin: string | undefined

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const original: string = e.command
    if (!/\b(git|gh)\b/.test(original)) return next(e)

    if (new RegExp(String.raw`${AT_COMMAND}git\s+config\s+(?:--\S+\s+)*${escapeRegExp(ALLOW_KEY)}\s+\S`, 'im').test(original)) {
      return { deny: `house-rules: only the user may set ${ALLOW_KEY}. Ask them to run it themselves.` }
    }

    identity ??= await identityFrom($, options)
    const { email: expectedEmail, names, githubLogin } = identity

    const setsIdentity = new RegExp(String.raw`${AT_COMMAND}git\s+config\s+(?:--(?:local|global|worktree|system|file\s+\S+)\s+)*user\.(email|name)\s+(${ARG})`, 'm').exec(original)
    if (setsIdentity) {
      const [, field, raw] = setsIdentity
      const value = unquote(raw ?? '')
      const expected = field === 'email' ? expectedEmail : names[0]
      const isAllowed = field === 'email' ? !expectedEmail || value === expectedEmail : names.length === 0 || names.includes(value)
      if (!isAllowed) {
        return { deny: `house-rules: git user.${field} must stay ${expected}. Never set it to "${value}"; ask the user if this repo needs a different identity.` }
      }
    }

    const notes = new Set<string>()
    const command = renameNewBranches(stripAttribution(stripIdentityOverrides(original, expectedEmail, notes), notes), rules, notes)
    const cwd = workingDir(command)
    const git = (...args: string[]) => $.process.run(['git', ...args], { cwd }).then(r => (r.exitCode === 0 ? r.stdout.trim() : ''))

    const pushedBranch = publishedBranches(command, rules)[0]
    const isPublishing = /\bgit\s+push\b|\bgh\s+pr\s+create\b/.test(command)
    const currentBranch = isPublishing && !pushedBranch ? await git('rev-parse', '--abbrev-ref', 'HEAD') : ''
    const badBranch = pushedBranch ?? (rules.blocked.test(currentBranch) ? currentBranch : undefined)
    if (badBranch) {
      return { deny: `house-rules: branch "${badBranch}" uses an AI/bot prefix. Rename it first with \`git branch -m ${badBranch} ${suggestedName(badBranch, rules)}\` (pick feat/, fix/, test/, refactor/, docs/ or chore/ to match the work), then push.` }
    }

    if (/\bgit\s+(?:[^;&|\n]*\s)?commit\b/.test(command) && (await git('config', '--get', ALLOW_KEY)) !== 'true') {
      const [email, name] = await Promise.all([git('config', 'user.email'), git('config', 'user.name')])
      const isWrongEmail = expectedEmail !== '' && email !== expectedEmail
      const isWrongName = names.length > 0 && !names.includes(name)
      if (isWrongEmail || isWrongName) {
        return { deny: `house-rules: this repo would commit as "${name} <${email}>", not "${names[0] ?? name} <${expectedEmail || email}>". Do not override it inline; stop and ask the user how to proceed.` }
      }
    }

    if (githubLogin && /\bgh\s+pr\s+create\b/.test(command)) {
      const login = verifiedLogin ?? (await $.process.run(['gh', 'api', 'user', '-q', '.login'], { cwd }).then(r => r.stdout.trim()))
      if (login !== githubLogin) {
        return { deny: `house-rules: gh is authenticated as "${login || 'unknown'}", not ${githubLogin}. Stop and ask the user before opening a PR.` }
      }
      verifiedLogin = login
    }

    if (notes.size === 0) return next(e)

    const summary = [...notes].join('; ')
    $.ui.toast(`house-rules: ${summary}`)
    const ran = await next({ ...e, command })
    if (ran.deny !== undefined) return ran

    return {
      ...ran,
      context: [...(ran.context ?? []), `house-rules corrected this command before it ran (${summary}). It ran as:\n${command}`],
    }
  })
}
