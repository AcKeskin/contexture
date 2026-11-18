// Prompt-cache clock: when the main loop last sent a request, how long the
// cache lives, and how big the context it would rewrite is. Pure: no $.
// Idea from karanb192/cache-tax (MIT); this keeps only the countdown and the
// warning, and never pings to keep the cache warm.

import type { CacheClock } from '../types'

export const HOUR_MS = 60 * 60 * 1000
export const FIVE_MIN_MS = 5 * 60 * 1000

export const NO_CLOCK: CacheClock = { lastRequestAt: 0, ttlMs: HOUR_MS, contextTokens: 0, isColdSaid: false }

type Usage = {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  ephemeral_5m_input_tokens?: number
  ephemeral_1h_input_tokens?: number
}

// `promptCacheTtl` as settings spell it ("5m", "1h"); undefined otherwise.
export function ttlSetting(value: unknown): number | undefined {
  const m = typeof value === 'string' ? /^(\d+)(m|h)$/.exec(value.trim()) : null
  if (!m) return undefined
  return Number(m[1]) * (m[2] === 'h' ? HOUR_MS : 60 * 1000)
}

// The TTL a request's write used, read from its usage; else `fallback`.
// A write with both lifetimes goes cold at the shorter one.
export function ttlFrom(usage: Usage, fallback: number): number {
  if ((usage.ephemeral_5m_input_tokens ?? 0) > 0) return FIVE_MIN_MS
  if ((usage.ephemeral_1h_input_tokens ?? 0) > 0) return HOUR_MS
  return fallback
}

export function contextOf(usage: Usage): number {
  return usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
}

export function isCold(c: CacheClock, now: number): boolean {
  return c.lastRequestAt !== 0 && now - c.lastRequestAt >= c.ttlMs
}

function minutes(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000))
  return m > 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

function tokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

// Status line part: `cache 42m` while warm, `cache cold` after; none before
// the first request.
export function cacheText(c: CacheClock, now: number): string | undefined {
  if (c.lastRequestAt === 0) return undefined
  return isCold(c, now) ? 'cache cold' : `cache ${minutes(c.lastRequestAt + c.ttlMs - now)}`
}

export function coldWarning(c: CacheClock): string {
  const size = c.contextTokens > 0 ? `about ${tokens(c.contextTokens)} tokens of context` : 'the whole context'
  return `Prompt cache expired. Your next message rewrites ${size}. /clear and a note is cheaper for a new topic.`
}
