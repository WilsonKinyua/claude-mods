import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CostLedger, GitInfo, Limit, Snapshot, Totals } from '../types'

const PANE = 'usage-details'
const LEDGER_PREFIX = 'cost:'
const KEEP_DAYS = 62

const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const git = atom({ plugin: 'usage-band', key: 'git' } as const, null)
const totals = atom({ plugin: 'usage-band', key: 'totals' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const warned = atom({ plugin: 'usage-band', key: 'warned' } as const, {})

const GREEN = '#3fb950'
const AMBER = '#d29922'
const RED = '#f85149'
const TRACK = 'rgba(128,128,128,0.35)'

const tone = (percent: number) => (percent >= 85 ? RED : percent >= 60 ? AMBER : GREEN)
const usd = (value: number) => `$${value < 10 ? value.toFixed(2) : value.toFixed(0)}`
const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

function countdown(resetsAt: string | undefined, at: number) {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - at) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d${hours}h`
  return hours > 0 ? `${hours}h${minutes % 60}m` : `${minutes}m`
}

function ring(percent: number, color: string) {
  const r = 9
  const c = 2 * Math.PI * r
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * c
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="${r}" fill="none" stroke="${TRACK}" stroke-width="2.5"/><circle cx="11" cy="11" r="${r}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${filled} ${c}" transform="rotate(-90 11 11)"/></svg>`
}

const glyph = (percent: number) => (percent >= 88 ? '●' : percent >= 63 ? '◕' : percent >= 38 ? '◑' : percent >= 13 ? '◔' : '○')

async function refreshGit($: EngineInterface) {
  const run = (...args: string[]) => $.process.run(['git', ...args]).catch(() => null)
  const [head, status] = await Promise.all([run('rev-parse', '--abbrev-ref', 'HEAD'), run('status', '--porcelain')])
  const info: GitInfo | null =
    head && head.exitCode === 0
      ? { branch: head.stdout.trim(), changes: status?.stdout.split('\n').filter(Boolean).length ?? 0 }
      : null
  await update($, git, () => info)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: 'usage', description: 'Show context and cost details in a pane' })
    await update($, now, () => Date.now())

    const first = await $.session.usage()
    await update($, usage, () => ({
      contextPercent: first.context.percent,
      limits: first.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
      sessionUsd: first.cost?.usd,
    }))
    await refreshGit($)

    $.clock.every(30_000, () => {
      void update($, now, () => Date.now())
      void refreshGit($)
    })

    return ran
  })

  on('session.measure', async ($, e, next) => {
    const at = await $.clock.now()
    const limits: Limit[] = e.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))
    const snapshot: Snapshot = { contextPercent: e.context.percent, limits, sessionUsd: e.cost?.usd }
    await update($, usage, () => snapshot)
    await update($, now, () => at)

    for (const limit of limits) {
      const level = limit.percentUsed >= 90 ? 90 : limit.percentUsed >= 80 ? 80 : 0
      const key = `${limit.kind}@${limit.resetsAt ?? ''}`
      const seen = (await read($, warned))[key] ?? 0
      if (level > seen) {
        $.ui.toast(`${LABELS[limit.kind] ?? limit.kind} limit at ${limit.percentUsed}% · resets in ${countdown(limit.resetsAt, at)}`, { timeoutMs: 8000 })
        await update($, warned, all => ({ ...all, [key]: level }))
      }
    }

    if (e.cost) {
      const sessionKey = `${LEDGER_PREFIX}${await $.session.id()}`
      const ledger = ((await $.store.get(sessionKey)) as CostLedger | undefined) ?? { lastUsd: 0, days: {} }
      const delta = Math.max(0, e.cost.usd - ledger.lastUsd)
      const today = dayOf(at)
      ledger.days[today] = (ledger.days[today] ?? 0) + delta
      ledger.lastUsd = e.cost.usd
      await $.store.set(sessionKey, ledger)

      const cutoff = dayOf(at - KEEP_DAYS * 86_400_000)
      const byDay: Record<string, number> = {}
      for (const key of await $.store.keys()) {
        if (!key.startsWith(LEDGER_PREFIX)) continue
        const entry = (await $.store.get(key)) as CostLedger | undefined
        const days = Object.entries(entry?.days ?? {})
        if (days.every(([day]) => day < cutoff)) {
          await $.store.delete(key)
          continue
        }
        for (const [day, value] of days) byDay[day] = (byDay[day] ?? 0) + value
      }
      const month = today.slice(0, 7)
      const sum: Totals = {
        todayUsd: byDay[today] ?? 0,
        monthUsd: Object.entries(byDay).reduce((acc, [day, value]) => (day.startsWith(month) ? acc + value : acc), 0),
        days: Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14),
      }
      await update($, totals, () => sum)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    await refreshGit($)
    return ran
  })

  on('command.run', { command: 'usage' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Usage' })
    return { text: 'Usage pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snapshot = await read($, usage)
    if (e.props.hasSurvey || !snapshot) return next(e)

    const [branch, sums, at] = await Promise.all([read($, git), read($, totals), read($, now)])
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements

    const meter = (key: string, percent: number, label: string, detail: string) => {
      const color = tone(percent)
      return (
        <Box key={key} flexDirection="row" alignItems="center" gap={1}>
          {'Svg' in elements ? (
            <elements.Svg source={ring(percent, color)} alt={`${label} ${percent}%`} width={22} height={22} />
          ) : (
            <Text color={color}>{glyph(percent)}</Text>
          )}
          <Text bold>{Math.round(percent)}%</Text>
          <Text dimColor>{detail ? `${label} · ${detail}` : label}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={3} paddingX={1}>
        {snapshot.limits.map(limit =>
          meter(limit.kind, limit.percentUsed, LABELS[limit.kind] ?? limit.kind, limit.resetsAt ? `resets ${countdown(limit.resetsAt, at)}` : ''),
        )}
        {snapshot.contextPercent !== undefined && meter('context', snapshot.contextPercent, 'ctx', '')}
        {snapshot.sessionUsd !== undefined && (
          <Box key="cost" flexDirection="row" alignItems="center" gap={1}>
            <Text bold color={GREEN}>{usd(snapshot.sessionUsd)}</Text>
            {sums && <Text dimColor>{`${usd(sums.todayUsd)} today  ${usd(sums.monthUsd)} mo`}</Text>}
          </Box>
        )}
        {branch && (
          <Box key="git" flexDirection="row" alignItems="center" gap={1}>
            <Text color="#58a6ff">⎇ {branch.branch}</Text>
            {branch.changes > 0 && <Text color={AMBER}>±{branch.changes}</Text>}
          </Box>
        )}
        <Button key="details" label="details" plain onPress={() => $.ui.open({ id: PANE, title: 'Usage' })} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [detail, sums] = await Promise.all([$.session.usage({ breakdown: 'summary' }), read($, totals)])
    const breakdown = detail.context.breakdown

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Context</Text>
          {breakdown ? (
            <>
              <Text dimColor>
                {breakdown.totalTokens.toLocaleString()} / {breakdown.maxTokens.toLocaleString()} tokens ({Math.round(breakdown.percentage)}%)
              </Text>
              {breakdown.categories
                .filter(category => category.tokens > 0)
                .map(category => (
                  <Text>
                    <Text color={category.color}>■ </Text>
                    {category.name}: {category.tokens.toLocaleString()}
                  </Text>
                ))}
            </>
          ) : (
            <Text dimColor>No breakdown yet.</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text bold>Spend (sessions with this mod loaded)</Text>
          {sums && sums.days.length > 0 ? (
            sums.days.map(([day, value]) => (
              <Text>
                {day}  {usd(value)}
              </Text>
            ))
          ) : (
            <Text dimColor>Nothing recorded yet.</Text>
          )}
        </Box>
      </Box>
    )
  })
}
