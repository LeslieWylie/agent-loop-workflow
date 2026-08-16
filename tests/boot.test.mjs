// Integration test: does this plugin actually register anything in a real harness?
//
// tests/host.test.mjs drives apply() against a stub context. A stub always has
// the service you hand it, so it cannot catch the failure this suite exists for:
// `inject: ['skills']` is a hard gate in cordis. If the skills service is not
// present when the plugin loads, cordis silently skips apply() — no error, no
// warning, and every unit test still passes while the plugin does nothing at
// all in the profile the user installed it into.
//
// So this one boots a genuine Context, loads the harness's own skill registry,
// loads this plugin the way a profile would, and then asks the *real* registry
// for the skill by name and reads its body back.
//
// It needs the harness packages, which are present inside a profile's
// node_modules but not in a bare checkout. When they cannot be resolved the
// suite SKIPS rather than fails, so `npm test` still works from a clone. That
// makes the skip path dangerous — a green tick proves nothing if this never
// ran — so look for "--- harness boot ---" in the output. To run it for real:
//
//   cd ~/.dsh/profiles/<profile>/node_modules/agent-loop-workflow
//   node tests/boot.test.mjs
//
// Run: node tests/boot.test.mjs

const SKILL_NAME = 'agent-loop-workflow'

let failures = 0
const check = (label, ok, detail) => {
  if (ok) { console.log(`  ok    ${label}`); return }
  failures++
  console.log(`  FAIL  ${label}`)
  if (detail !== undefined) console.log(`        ${detail}`)
}

const REQUIRED = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-skill']

const harness = {}
for (const specifier of REQUIRED) {
  try {
    harness[specifier] = await import(specifier)
  } catch (error) {
    console.log('\n--- harness boot: SKIPPED ---')
    console.log(`  ${specifier} is not resolvable from here (${error.code ?? 'error'}).`)
    console.log('  Run this suite from inside an installed profile to exercise it.')
    process.exit(0)
  }
}

console.log('\n--- harness boot ---')

const { Context } = harness['@deepseek-ai/cordis']
const asPlugin = (mod) => mod.default ?? mod

const ctx = new Context()
const warnings = []
ctx.on('internal/warning', (...args) => warnings.push(args.map(String).join(' ')))

await ctx.plugin(asPlugin(harness['@deepseek-ai/dsh-skill']), {})
await new Promise((resolve) => setTimeout(resolve, 200))

const skills = ctx.get('skills')
check('the harness provides a real skills service', skills !== undefined,
  'without it cordis skips apply() silently, so the rest would prove nothing')

if (skills === undefined) {
  console.log(`\nFAIL — ${++failures} failing check(s)\n`)
  process.exit(1)
}

// Load this package by its own entry point, exactly as the profile loader would.
const self = await import('../host.js')
await ctx.plugin(asPlugin(self), {})
await new Promise((resolve) => setTimeout(resolve, 300))

const summaries = await skills.list()
const listed = summaries.find((entry) => entry.name === SKILL_NAME)
check(`${SKILL_NAME} reaches the real skill registry`, listed !== undefined,
  warnings.length
    ? `warnings: ${warnings.join(' | ')}`
    : `registry listed [${summaries.map((entry) => entry.name).join(', ') || 'nothing'}] and nothing warned`)

if (listed === undefined) {
  console.log(`\nFAIL — ${++failures} failing check(s)\n`)
  process.exit(1)
}

check('the listing carries a description the model can route on',
  typeof listed.description === 'string' && listed.description.length > 0,
  JSON.stringify(listed))

console.log('\n--- read the skill back through the registry ---')

const definition = await skills.get(SKILL_NAME)
check('get() returns the definition', definition !== undefined)

const body = definition?.content ?? ''
check('the body came back intact', body.length > 0, `length ${body.length}`)
check('it is a frontmatter document the skill loader can parse',
  body.startsWith(`---\nname: ${SKILL_NAME}\n`), JSON.stringify(body.slice(0, 40)))
check('the workflow sections survived the round trip',
  ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.'].every((h) => body.includes(h)))

// The payload guard in host.test.mjs runs against what apply() hands the stub.
// This re-runs the cheapest half against what the *registry* actually returns,
// so a leak introduced anywhere between the two is still caught.
const CREDENTIALISH = [
  /[a-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)(?!users\.noreply\.github\.com\b)[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b(?:[a-z0-9-]+\.)+(?:internal|corp|local|lan|intra)\b/i,
  /\b[A-Z][A-Z0-9]{2,}_(?:API_)?(?:KEY|TOKEN|SECRET)\b/,
]
check('what the registry serves leaks no identity or credential shapes',
  !CREDENTIALISH.some((re) => re.test(body)))

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failing check(s)\n`)
process.exit(failures === 0 ? 0 : 1)
