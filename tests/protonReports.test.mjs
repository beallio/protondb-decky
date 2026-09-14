import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('legacy game titles are accepted but a different numeric app ID is rejected', async () => {
  let reportedGame = 'Stardew Valley'
  const response = () => ({
    page: 1,
    perPage: 40,
    total: 1,
    reports: [
      {
        id: 'legacy-title-report',
        timestamp: 1782704608,
        responses: { answerToWhatGame: reportedGame, verdict: 'yes' },
        device: { hardwareType: 'steamDeck' }
      }
    ]
  })
  const source = fs.readFileSync(
    new URL('../src/actions/protonReports.ts', import.meta.url),
    'utf8'
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    AbortController,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === '@decky/api') {
        return {
          async fetchNoCors(url) {
            return new Response(
              JSON.stringify(
                url.endsWith('/counts.json')
                  ? { reports: 450159, timestamp: 1789144363 }
                  : response()
              ),
              { status: 200 }
            )
          }
        }
      }
      if (name === '../cache/protobDbCache') {
        return {
          getCachedReports: async () => null,
          setCachedReports: async () => {}
        }
      }
      throw new Error(`Unexpected dependency: ${name}`)
    }
  })
  const load = () =>
    module.exports.getReportPage({
      appId: '413150',
      device: 'steam-deck',
      page: 1,
      isCurrent: () => true
    })

  reportedGame = '620'
  await assert.rejects(load(), /wrong game/)

  reportedGame = 'Stardew Valley'
  const page = await load()
  assert.equal(page.appId, '413150')
  assert.equal(page.reports[0].id, 'legacy-title-report')
  assert.equal(page.reports[0].outcome, 'working')
})
