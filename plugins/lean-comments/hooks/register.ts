import type { EngineInterface, PluginOptions, Register, ToolCallResult } from 'claude-code'

type Syntax = { line: string[]; blocks: [string, string][] }
type Comment = { text: string; lines: number; isDoc: boolean }
type Settings = { mode: string; maxLength: number; maxNew: number; allowDocComments: boolean }

const SLASH_BLOCK: [string, string] = ['/*', '*/']
const HTML_BLOCK: [string, string] = ['<!--', '-->']
const C_LIKE: Syntax = { line: ['//'], blocks: [SLASH_BLOCK] }
const HASH: Syntax = { line: ['#'], blocks: [] }

const SYNTAX: Record<string, Syntax> = {
  ...Object.fromEntries(
    ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'go', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'rs', 'dart', 'scala', 'groovy', 'gradle', 'scss', 'less'].map(ext => [ext, C_LIKE]),
  ),
  ...Object.fromEntries(['py', 'rb', 'sh', 'bash', 'zsh', 'yml', 'yaml', 'toml', 'r', 'pl', 'ex', 'exs', 'tf', 'dockerfile'].map(ext => [ext, HASH])),
  php: { line: ['//', '#'], blocks: [SLASH_BLOCK, HTML_BLOCK] },
  css: { line: [], blocks: [SLASH_BLOCK] },
  sql: { line: ['--'], blocks: [SLASH_BLOCK] },
  lua: { line: ['--'], blocks: [] },
  html: { line: [], blocks: [HTML_BLOCK] },
  vue: { line: ['//'], blocks: [SLASH_BLOCK, HTML_BLOCK] },
  svelte: { line: ['//'], blocks: [SLASH_BLOCK, HTML_BLOCK] },
  astro: { line: ['//'], blocks: [SLASH_BLOCK, HTML_BLOCK] },
}

const DIRECTIVE = /^(?:eslint|@ts-|prettier-ignore|biome-ignore|istanbul|c8 |noqa|type:\s*ignore|pylint|pyright|mypy|pragma|#?region|#?endregion|@license|@preserve|SPDX|jshint|global |@jsx|@flow|@vite-ignore|webpack|nolint|go:|\+build|-\*-|!|@refresh|rubocop|shellcheck|phpcs|@phpstan|@psalm|@var |@codeCoverageIgnore|NOSONAR|language=)/i
const DECORATIVE = /[─━═│┃█▓▒░╔╗╚╝]|[-=*#~_+]{4,}/
const NARRATION = /^(?:step \d+\b|first,? we\b|now,? we\b|here,? we\b|next,? we\b|this (?:function|method|component|class|hook|file|module|block)\b|the following\b|section\b|end of\b|(?:helpers?|imports?|constants?|types?|exports?|utils?|utilities|state|handlers?|styles?|setup|main|config(?:uration)?)\s*:?\s*$)/i

const extension = (path: string) => {
  const base = path.split('/').pop() ?? ''
  return base.toLowerCase() === 'dockerfile' ? 'dockerfile' : (base.split('.').pop() ?? '').toLowerCase()
}

const hasBalancedQuotes = (text: string) => ['"', "'", '`'].every(q => (text.split(q).length - 1) % 2 === 0)

function trailingComment(line: string, tokens: string[]) {
  for (const token of tokens) {
    let at = line.indexOf(` ${token}`)
    while (at > 0) {
      if (hasBalancedQuotes(line.slice(0, at))) return line.slice(at + 1)
      at = line.indexOf(` ${token}`, at + 1)
    }
  }
  return undefined
}

function extractComments(source: string, syntax: Syntax): Comment[] {
  const comments: Comment[] = []
  let block: { end: string; lines: string[] } | undefined
  let run: string[] = []

  const flushRun = () => {
    if (run.length > 0) comments.push({ text: run.join('\n'), lines: run.length, isDoc: false })
    run = []
  }

  source.split('\n').forEach((raw, index) => {
    const line = raw.trim()

    if (block) {
      block.lines.push(line)
      if (line.includes(block.end)) {
        comments.push({ text: block.lines.join('\n'), lines: block.lines.length, isDoc: block.lines[0]?.startsWith('/**') ?? false })
        block = undefined
      }
      return
    }

    if (index === 0 && line.startsWith('#!')) return

    const lineToken = syntax.line.find(token => line.startsWith(token))
    if (lineToken) {
      run.push(line)
      return
    }
    flushRun()

    const opener = syntax.blocks.find(([open]) => line.startsWith(open))
    if (opener) {
      const [open, close] = opener
      if (line.includes(close, open.length)) {
        comments.push({ text: line, lines: 1, isDoc: line.startsWith('/**') })
      } else {
        block = { end: close, lines: [line] }
      }
      return
    }

    const trailing = trailingComment(line, syntax.line)
    if (trailing) comments.push({ text: trailing, lines: 1, isDoc: false })
  })

  flushRun()
  return comments
}

const content = (comment: Comment) =>
  comment.text
    .split('\n')
    .map(line => line.replace(/^(?:\/\*\*?|\*\/|\*|\/\/+|#+|--|<!--|-->)\s?/, '').replace(/\s*(?:\*\/|-->)$/, '').trim())
    .filter(Boolean)
    .join(' ')

const normalize = (comment: Comment) => content(comment).replace(/\s+/g, ' ').toLowerCase()

function problemsWith(comment: Comment, settings: Settings) {
  const text = content(comment)
  if (DIRECTIVE.test(text) || DIRECTIVE.test(comment.text.replace(/^\/\/|^#/, ''))) return []

  const problems: string[] = []
  if (DECORATIVE.test(comment.text)) problems.push('decorative banner or divider')
  if (comment.lines > 1 && !(comment.isDoc && settings.allowDocComments)) problems.push(`spans ${comment.lines} lines`)
  if (text.length > settings.maxLength) problems.push(`${text.length} characters (max ${settings.maxLength})`)
  if (NARRATION.test(text)) problems.push('narrates or labels the code instead of explaining a non-obvious why')
  return problems
}

function settingsFrom(options: PluginOptions): Settings {
  const number = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback)
  return {
    mode: String(options.mode ?? 'block'),
    maxLength: number(options.maxLength, 120),
    maxNew: number(options.maxNewComments, 3),
    allowDocComments: options.allowDocComments === true,
  }
}

export function review(path: string, before: string, after: string, settings: Settings) {
  const syntax = SYNTAX[extension(path)]
  if (!syntax) return []

  const existing = new Set(extractComments(before, syntax).map(normalize))
  const added = extractComments(after, syntax).filter(comment => !existing.has(normalize(comment)))
  const findings = added
    .map(comment => ({ comment, problems: problemsWith(comment, settings) }))
    .filter(finding => finding.problems.length > 0)
    .map(({ comment, problems }) => `- \`${comment.text.split('\n')[0]?.slice(0, 80)}${comment.lines > 1 ? ' …' : ''}\`: ${problems.join(', ')}`)

  const counted = added.filter(comment => !DIRECTIVE.test(content(comment)))
  if (counted.length > settings.maxNew) findings.push(`- ${counted.length} new comments in one change (max ${settings.maxNew}); most code needs none`)

  return findings
}

async function enforce(
  $: EngineInterface,
  settings: Settings,
  path: string,
  before: string,
  after: string,
  run: () => Promise<ToolCallResult>,
): Promise<ToolCallResult> {
  const findings = review(path, before, after, settings)
  if (findings.length === 0) return run()

  const file = path.split('/').pop()
  const message = [
    `lean-comments: this change adds comments that break the comment rules in ${file}:`,
    ...findings,
    'Only comment a non-obvious why (a constraint, workaround or invariant), as one short sentence on one line. Prefer clearer names over comments. Remove or shorten these, then make the change again.',
  ].join('\n')

  if (settings.mode !== 'warn') return { deny: message }

  $.ui.toast(`lean-comments: ${findings.length} comment issue${findings.length === 1 ? '' : 's'} in ${file}`)
  const ran = await run()
  return ran.deny !== undefined ? ran : { ...ran, context: [...(ran.context ?? []), message] }
}

export const register: Register = (on, options) => {
  const settings = settingsFrom(options)
  if (settings.mode === 'off') return

  on('tool.call', { tool: 'Edit' }, ($, e, next) =>
    enforce($, settings, e.file_path, e.old_string, e.new_string, () => next(e)),
  )

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const before = await $.fs.read(e.file_path).then(
      text => (typeof text === 'string' ? text : ''),
      () => '',
    )
    return enforce($, settings, e.file_path, before, e.content, () => next(e))
  })
}
