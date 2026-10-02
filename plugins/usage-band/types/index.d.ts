export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  contextPercent?: number
  limits: Limit[]
  sessionUsd?: number
}

export type GitInfo = { branch: string; changes: number }

export type Totals = { todayUsd: number; monthUsd: number; days: [string, number][] }

export type CostLedger = { lastUsd: number; days: Record<string, number> }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      usage: Snapshot | null
      git: GitInfo | null
      totals: Totals | null
      now: number
      warned: Record<string, number>
    }
  }
}
