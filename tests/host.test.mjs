// Real executing tests for host.js — no test-framework dependency, run with:
//   node tests/host.test.mjs
// Uses only Node's built-in node:test / node:assert (ships with Node, nothing to install).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import host from '../host.js'

// Strings that must never appear in a published skill payload. Kept in sync
// with the account-wide desensitization list; update both places together.
const BANNED = [
  'mlamp',
  'mininglamp',
  'code.mlamp.cn',
  'llm-gateway.mlamp.cn',
  'MLAMP_API_KEY',
  'rlvr',
  'octoloop',
  '武垚乐',
  'wuyaole@mininglamp.com',
  'wyl516@bupt.edu.cn',
  'yaolewu@mlamp.cn',
]

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

test('registered skill payload contains no leaked identity/jargon strings', () => {
  const registered = []
  host.apply(makeCtx({ register: (def) => registered.push(def) }))
  const skill = registered[0]
  const haystack = [skill.name, skill.description, skill.whenToUse, skill.content].join('\n')

  for (const needle of BANNED) {
    assert.ok(!haystack.includes(needle), `found banned string "${needle}" in registered skill payload`)
  }
})
