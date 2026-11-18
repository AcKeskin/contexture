import { expect, test } from 'claude-code/testing'

import { cacheText, coldWarning, contextOf, FIVE_MIN_MS, HOUR_MS, isCold, NO_CLOCK, ttlFrom, ttlSetting } from '../hooks/cache'

const USAGE = { input_tokens: 10, cache_read_input_tokens: 119000, cache_creation_input_tokens: 990, output_tokens: 5 }

test('the TTL comes from the write split, then the setting', () => {
  expect(ttlFrom({ ...USAGE, ephemeral_1h_input_tokens: 990, ephemeral_5m_input_tokens: 0 }, FIVE_MIN_MS)).toBe(HOUR_MS)
  expect(ttlFrom({ ...USAGE, ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 990 }, HOUR_MS)).toBe(FIVE_MIN_MS)
  expect(ttlFrom({ ...USAGE, ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 490 }, HOUR_MS)).toBe(FIVE_MIN_MS)
  expect(ttlFrom(USAGE, FIVE_MIN_MS)).toBe(FIVE_MIN_MS)
  expect(ttlSetting('5m')).toBe(FIVE_MIN_MS)
  expect(ttlSetting('1h')).toBe(HOUR_MS)
  expect(ttlSetting(undefined)).toBeUndefined()
  expect(ttlSetting('soon')).toBeUndefined()
})

test('the countdown reads minutes left, then cold', () => {
  const c = { ...NO_CLOCK, lastRequestAt: 1000 }
  expect(cacheText(NO_CLOCK, 5000)).toBeUndefined()
  expect(cacheText(c, 1000 + 18 * 60000)).toBe('cache 42m')
  expect(cacheText(c, 1000 + HOUR_MS - 1)).toBe('cache 1m')
  expect(isCold(c, 1000 + HOUR_MS)).toBe(true)
  expect(cacheText(c, 1000 + HOUR_MS)).toBe('cache cold')
  expect(cacheText({ ...c, ttlMs: 2 * HOUR_MS }, 1000)).toBe('cache 2h00m')
})

test('the warning names the context size when known', () => {
  expect(contextOf(USAGE)).toBe(120000)
  expect(coldWarning({ ...NO_CLOCK, contextTokens: 120000 })).toContain('about 120k tokens of context')
  expect(coldWarning(NO_CLOCK)).toContain('the whole context')
})
