import { expect, test } from 'claude-code/testing'

import { hunks, keepHunk, undoHunk } from '../hooks/diff'

const BEFORE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'].join('\n')
const AFTER = ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o'].join('\n')

test('two changes far apart make two hunks with three context lines', () => {
  const hs = hunks(BEFORE, AFTER)
  expect(hs).toHaveLength(2)
  expect(hs[0]?.text).toBe('@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e')
  expect(hs[1]?.text).toBe("@@ -12,3 +12,4 @@\n l\n m\n n\n+o")
  expect(hunks(BEFORE, BEFORE)).toEqual([])
})

test('undo puts one hunk back, keep takes it into the baseline', () => {
  const [first, second] = hunks(BEFORE, AFTER)
  if (!first || !second) throw new Error('two hunks expected')
  const undone = undoHunk(BEFORE, AFTER, first)
  expect(hunks(BEFORE, undone).map(h => h.adds)).toEqual([1])
  expect(undone.split('\n')[1]).toBe('b')
  const kept = keepHunk(BEFORE, AFTER, second)
  expect(hunks(kept, AFTER).map(h => h.text.split('\n')[0])).toEqual(['@@ -1,5 +1,5 @@'])
})

test('a new file is all adds; CRLF lines draw without the \\r', () => {
  expect(hunks('', 'x\ny')[0]?.adds).toBe(2)
  expect(hunks('', 'x\n').map(h => [h.adds, h.dels])).toEqual([[1, 0]])
  expect(hunks('a\r\nb\r\n', 'a\r\nc\r\n')[0]?.text).toBe('@@ -1,2 +1,2 @@\n a\n-b\n+c')
  const crlf = 'a\r\nb\r\nc\r\n'
  const edited = 'a\r\nB\r\nc\r\n'
  const [h] = hunks(crlf, edited)
  if (!h) throw new Error('one hunk expected')
  expect(undoHunk(crlf, edited, h)).toBe(crlf)
  expect(keepHunk(crlf, edited, h)).toBe(edited)
})

test('a hunk id changes when its text does, even at the same lines', () => {
  expect(hunks('a\nb\nc', 'a\nX\nc')[0]?.id).not.toBe(hunks('a\nb\nc', 'a\nY\nc')[0]?.id)
  expect(hunks('a\nb\nc\nd\ne\nf\ng\nh', 'a\nb\nc\nd\ne\nf\ng\nH')[0]?.at).toBe(7)
})

test('undoing or keeping the last hunk keeps that side\'s final newline', () => {
  const was = 'a\nb\n'
  const now = 'a\nB'
  const [h] = hunks(was, now)
  if (!h) throw new Error('one hunk expected')
  expect(undoHunk(was, now, h)).toBe(was)
  expect(keepHunk(was, now, h)).toBe(now)
  const [n] = hunks('', 'x\n')
  if (!n) throw new Error('one hunk expected')
  expect(keepHunk('', 'x\n', n)).toBe('x\n')
})
