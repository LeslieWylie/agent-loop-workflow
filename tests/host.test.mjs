// Real executing tests for host.js — no test-framework dependency, run with:
//   node tests/host.test.mjs
// Uses only Node's built-in node:test / node:assert (ships with Node, nothing to install).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import host from '../host.js'

// Shapes that must never appear in a published skill payload.
//
// These are deliberately *patterns*, not a list of literal strings. An earlier
// version of this file enumerated the exact hostnames, API-key names, personal
// name and email addresses it was guarding against — which published every one
// of them to anyone who opened the test, i.e. the guard leaked precisely what
// it existed to prevent. Patterns catch the same cases, catch new ones nobody
// thought to enumerate, and disclose nothing themselves.
//
// Instance-specific strings (a real name, a specific internal codename) belong
// in `tests/banned.local.json` — gitignored, optional, an array of strings.
// It is absent in CI, so CI runs the pattern half only.
const BANNED_SHAPES = [
  {
    what: 'an email address that is not an example/noreply placeholder',
    re: /[a-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)(?!users\.noreply\.github\.com\b)[a-z0-9.-]+\.[a-z]{2,}/i,
  },
  {
    what: 'a private or corporate-looking hostname',
    re: /\b(?:[a-z0-9-]+\.)+(?:internal|corp|local|lan|intra)\b/i,
  },
  {
    what: 'a named API key, token or secret constant',
    re: /\b[A-Z][A-Z0-9]{2,}_(?:API_)?(?:KEY|TOKEN|SECRET)\b/,
  },
  {
    what: 'an inline credential blob',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|gho|glpat)-[A-Za-z0-9_-]{16,}/,
  },
  {
    what: 'a URL carrying inline credentials',
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i,
  },
]

async function localBanned() {
  try {
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(new URL('./banned.local.json', import.meta.url), 'utf8')
    const list = JSON.parse(raw)
    assert.ok(Array.isArray(list), 'banned.local.json must be an array of strings')
    return list
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function makeCtx(skillsStub) {
  return {
    get(name) {
      return name === 'skills' ? skillsStub : undefined
    },
  }
}

test('exports the cordis plugin contract: apply(ctx) + inject: ["skills"]', () => {
  assert.equal(typeof host.apply, 'function')
  assert.deepEqual(host.inject, ['skills'])
})

test('apply() no-ops instead of throwing when the skills service is unavailable', () => {
  assert.doesNotThrow(() => host.apply(makeCtx(undefined)))
})

test('apply() registers exactly one runtime skill with a valid shape', () => {
  const registered = []
  const skills = { register: (def) => registered.push(def) }
  host.apply(makeCtx(skills))

  assert.equal(registered.length, 1)
  const skill = registered[0]

  // skill-filesystem (the native provider) requires kebab-case names —
  // a runtime-registered skill should hold itself to the same rule.
  assert.match(skill.name, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  assert.equal(skill.name, 'agent-loop-workflow')
  assert.equal(skill.source, 'runtime')
  assert.equal(typeof skill.description, 'string')
  assert.ok(skill.description.length > 0)
  assert.equal(typeof skill.whenToUse, 'string')
  assert.ok(skill.whenToUse.length > 0)
  assert.equal(typeof skill.content, 'string')
})

test('registered content carries the expected workflow structure', () => {
  const registered = []
  host.apply(makeCtx({ register: (def) => registered.push(def) }))
  const { content } = registered[0]

  assert.match(content, /^---\nname: agent-loop-workflow\n/)
  assert.ok(content.includes('# agent-loop-workflow'))
  for (const heading of ['## 1. 角色拓扑', '## 2. Loop Guard 循环防护', '## 3. 标准 handoff 格式', '## 4. 风险三档分流', '## 5. 交付顺序', '## 6. review → 收口协议', '## 7. 防回环', '## 8. 通用红线']) {
    assert.ok(content.includes(heading), `missing section: ${heading}`)
  }
})

test('registered skill payload leaks no identity, host or credential shapes', async () => {
  const registered = []
  host.apply(makeCtx({ register: (def) => registered.push(def) }))
  const skill = registered[0]
  const haystack = [skill.name, skill.description, skill.whenToUse, skill.content].join('\n')

  for (const { what, re } of BANNED_SHAPES) {
    const hit = haystack.match(re)
    assert.equal(hit, null, hit ? `payload contains ${what}: ${JSON.stringify(hit[0])}` : '')
  }

  // Optional local layer for strings that cannot be expressed as a shape.
  // The failure message names the index, never the string, so a CI log from a
  // machine that *does* have the file still gives nothing away.
  const extra = await localBanned()
  extra.forEach((needle, index) => {
    assert.ok(!haystack.includes(needle), `payload contains banned.local.json[${index}]`)
  })
})

test('the guard itself catches what it claims to', () => {
  // A denylist that matches nothing is indistinguishable from one that works,
  // so every pattern gets a sample it is required to match.
  //
  // The samples are assembled from fragments rather than written out whole. A
  // repo-wide scanner cannot tell a deliberate fixture from a real leak, and it
  // should not have to guess: the leak this guard exists for lived in this very
  // file, so excluding tests/ from that scan would reopen the exact hole. The
  // separators below keep the file literally clean while the assembled strings
  // still exercise the patterns.
  const AT = String.fromCharCode(64)
  const UNDER = '_'
  const DOT = '.'
  const DASH = '-'

  const samples = [
    `contact alice${AT}somecorp.com for access`,
    `the box is build-07${DOT}corp`,
    `read ACME${UNDER}API${UNDER}KEY from the env`,
    `token glpat${DASH}ABCDEFGHIJKLMNOPQRSTUV`,
    `clone https://user:hunter2${AT}git.somewhere.org/repo.git`,
  ]
  samples.forEach((sample, index) => {
    assert.ok(
      BANNED_SHAPES.some(({ re }) => re.test(sample)),
      `sample ${index} slipped through every pattern: ${sample}`,
    )
  })

  // ...and does not fire on the payload's legitimate vocabulary.
  for (const benign of ['MR/PR', 'loop-state.json', 'verification.json', 'in_review', 'fast/standard/high']) {
    for (const { what, re } of BANNED_SHAPES) {
      assert.ok(!re.test(benign), `false positive: "${benign}" matched ${what}`)
    }
  }
})
