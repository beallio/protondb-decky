export interface InstalledTool {
  toolName: string
  displayName: string
}

export let lastDebugInfo = ''

export async function getInstalledCompatTools(): Promise<InstalledTool[]> {
  try {
    const sc = (globalThis as any).SteamClient
    if (!sc) {
      lastDebugInfo = 'No SteamClient'
      return []
    }
    if (!sc.Settings) {
      lastDebugInfo = `No Settings. Keys: ${Object.keys(sc).slice(0, 15).join(',')}`
      return []
    }
    if (!sc.Settings.GetGlobalCompatTools) {
      lastDebugInfo = `No GetGlobalCompatTools. Settings keys: ${Object.keys(sc.Settings).slice(0, 15).join(',')}`
      return []
    }
    let tools = sc.Settings.GetGlobalCompatTools()

    if (
      tools &&
      typeof tools === 'object' &&
      typeof tools.then === 'function'
    ) {
      tools = await tools
    }

    if (!tools) {
      lastDebugInfo = 'GetGlobalCompatTools returned falsy'
      return []
    }
    if (!Array.isArray(tools)) {
      const keys = Object.keys(tools).slice(0, 15).join(',')
      const vals = Object.values(tools)
        .slice(0, 3)
        .map((v: any) =>
          typeof v === 'object' && v
            ? Object.keys(v).slice(0, 5).join('/')
            : String(v).slice(0, 30)
        )
        .join(' | ')
      lastDebugInfo = `Not array. Type: ${typeof tools}, keys: [${keys}], vals: [${vals}]`
      return []
    }
    if (tools.length === 0) {
      lastDebugInfo = 'Empty array'
      return []
    }
    const first = tools[0]
    const sampleKeys = Object.keys(first).join(',')
    lastDebugInfo = `Found ${tools.length} tools. Keys: ${sampleKeys}. First: ${JSON.stringify(first).slice(0, 100)}`

    return tools
      .filter((t: any) => t && typeof t === 'object')
      .map((t: any) => ({
        toolName:
          t.strToolName || t.toolName || t.name || t.internal_name || '',
        displayName:
          t.strDisplayName ||
          t.displayName ||
          t.display_name ||
          t.strToolName ||
          t.toolName ||
          t.name ||
          ''
      }))
      .filter((t) => t.toolName)
  } catch (e: any) {
    lastDebugInfo = `Error: ${e?.message || String(e)}`
    return []
  }
}

export function findMatchingTool(
  versionName: string,
  tools: InstalledTool[]
): InstalledTool | null {
  try {
    if (!versionName || typeof versionName !== 'string' || !tools?.length)
      return null
    const normalized = versionName.toLowerCase().trim()

    if (normalized === 'unknown' || normalized === 'other') {
      lastDebugInfo = `"${normalized}" has no applicable Proton tool`
      return null
    }

    if (normalized === 'native linux') {
      lastDebugInfo = `"Native Linux" → clear compat tool (run natively)`
      return { toolName: '', displayName: 'Native (no Proton)' }
    }

    if (normalized === 'proton official') {
      const official = findLatestOfficial(tools)
      lastDebugInfo = official
        ? `"Proton Official" → ${official.displayName}`
        : `"Proton Official" no match`
      return official
    }

    if (normalized === 'ge-proton' || normalized === 'proton-ge') {
      const ge =
        tools.find((t) => t.displayName.toLowerCase() === 'proton-ge latest') ||
        findLatestGE(tools)
      lastDebugInfo = ge
        ? `"GE-Proton" → ${ge.displayName}`
        : `"GE-Proton" no match`
      return ge
    }

    if (normalized === 'hotfix') {
      const hf = tools.find((t) =>
        t.displayName.toLowerCase().includes('hotfix')
      )
      lastDebugInfo = hf ? `"Hotfix" → ${hf.displayName}` : `"Hotfix" no match`
      return hf || null
    }

    const exactDisplay = tools.find(
      (t) => t.displayName.toLowerCase().trim() === normalized
    )
    if (exactDisplay) {
      lastDebugInfo = `Exact: "${normalized}" → ${exactDisplay.displayName}`
      return exactDisplay
    }

    const exactTool = tools.find(
      (t) => t.toolName.toLowerCase().trim() === normalized
    )
    if (exactTool) {
      lastDebugInfo = `Tool name: "${normalized}" → ${exactTool.displayName}`
      return exactTool
    }

    const containsDisplay = tools.find(
      (t) =>
        t.displayName.toLowerCase().includes(normalized) ||
        normalized.includes(t.displayName.toLowerCase())
    )
    if (containsDisplay) {
      lastDebugInfo = `Partial: "${normalized}" → ${containsDisplay.displayName}`
      return containsDisplay
    }

    const majorMatch = extractMajorVersion(normalized)
    if (majorMatch) {
      const match = tools.find((t) => {
        const toolMajor = extractMajorVersion(t.displayName.toLowerCase())
        return toolMajor === majorMatch
      })
      if (match) {
        lastDebugInfo = `Major v${majorMatch}: "${normalized}" → ${match.displayName}`
        return match
      }
    }

    lastDebugInfo = `No match for "${normalized}"`
    return null
  } catch (e: any) {
    lastDebugInfo = `Match error: ${e?.message || String(e)}`
    return null
  }
}

function findLatestOfficial(tools: InstalledTool[]): InstalledTool | null {
  const officials = tools.filter((t) => {
    const d = t.displayName.toLowerCase()
    return (
      d.startsWith('proton ') &&
      /proton \d/.test(d) &&
      !d.includes('ge') &&
      !d.includes('hotfix') &&
      !d.includes('experimental')
    )
  })
  if (!officials.length) return null
  officials.sort((a, b) => {
    const va = parseFloat(a.displayName.replace(/[^0-9.]/g, '')) || 0
    const vb = parseFloat(b.displayName.replace(/[^0-9.]/g, '')) || 0
    return vb - va
  })
  return officials[0]
}

function findLatestGE(tools: InstalledTool[]): InstalledTool | null {
  const geTools = tools.filter((t) => {
    const d = t.displayName.toLowerCase()
    return d.includes('ge-proton') || d.includes('proton-ge')
  })
  if (!geTools.length) return null
  geTools.sort((a, b) => {
    const va =
      parseFloat(a.displayName.replace(/[^0-9.]/g, '').slice(0, 4)) || 0
    const vb =
      parseFloat(b.displayName.replace(/[^0-9.]/g, '').slice(0, 4)) || 0
    return vb - va
  })
  return geTools[0]
}

function extractMajorVersion(version: string): string | null {
  const match = version.match(/proton\s*(\d+)/)
  if (match) return match[1]
  const geMatch = version.match(/ge-proton(\d+)/)
  if (geMatch) return geMatch[1]
  return null
}

export function applyCompatTool(appId: number, toolName: string): boolean {
  try {
    const apps = (globalThis as any).SteamClient?.Apps
    if (!apps?.SpecifyCompatTool) return false
    apps.SpecifyCompatTool(appId, toolName)
    return true
  } catch {
    return false
  }
}

export async function getCurrentCompatTool(appId: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      const apps = (globalThis as any).SteamClient?.Apps
      if (!apps?.RegisterForAppDetails) {
        resolve('')
        return
      }
      let settled = false
      const reg = apps.RegisterForAppDetails(appId, (details: any) => {
        if (settled) return
        settled = true
        if (reg?.unregister) reg.unregister()
        resolve(details?.strCompatToolName || '')
      })
      setTimeout(() => {
        if (!settled) {
          settled = true
          if (reg?.unregister) reg.unregister()
          resolve('')
        }
      }, 1500)
    } catch {
      resolve('')
    }
  })
}

export function parseVersionNumber(name: string): number {
  if (!name || typeof name !== 'string') return 0
  const n = name.toLowerCase()
  const protonMatch = n.match(/proton[_ ](\d+)/)
  if (protonMatch) return parseInt(protonMatch[1], 10)
  const geMatch = n.match(/ge-proton(\d+)/)
  if (geMatch) return parseInt(geMatch[1], 10)
  if (n.includes('experimental')) return 999
  if (n.includes('hotfix')) return 998
  return 0
}

export function isDowngrade(
  currentToolName: string,
  newToolDisplayName: string
): boolean {
  if (!currentToolName) return false
  const currentVersion = parseVersionNumber(currentToolName)
  const newVersion = parseVersionNumber(newToolDisplayName)
  if (currentVersion === 0 || newVersion === 0) return false
  return newVersion < currentVersion
}
