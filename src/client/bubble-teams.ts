import type { EnrichTeam } from './bubble-enrich.ts'

const STATE_URL = '/plugins/dsh-agent-orchestra/state'
const TTL_MS = 2000

let cachedPromise: Promise<readonly EnrichTeam[]> | undefined
let cachedAt = 0

/** Shared snapshot loader: multiple bubbles reuse one in-flight/fresh promise.
 *  Never throws: fetch failure degrades to an empty list. */
export function loadTeams(): Promise<readonly EnrichTeam[]> {
  const now = Date.now()
  if (cachedPromise === undefined || now - cachedAt > TTL_MS) {
    cachedAt = now
    cachedPromise = (async () => {
      try {
        const res = await fetch(STATE_URL, { cache: 'no-store' })
        if (!res.ok) return []
        const body = (await res.json()) as { teams?: readonly EnrichTeam[] }
        return Array.isArray(body?.teams) ? body.teams : []
      } catch {
        return []
      }
    })().finally(() => {
      cachedPromise = undefined
    })
  }
  return cachedPromise
}
