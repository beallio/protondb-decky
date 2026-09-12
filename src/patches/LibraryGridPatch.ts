import { fetchNoCors } from '@decky/api'
import { createModuleMapping } from '@decky/ui'
import { createElement } from 'react'
import { createPortal } from 'react-dom'
import LibraryGridIcon, {
  libraryGridIconCss
} from '../components/libraryGridIcon'
import { SettingsContext } from '../hooks/useSettings'
import { GATEWAY_BASE_URL, GATEWAY_API_KEY, appTypes } from '../constants'
import {
  getCache,
  updateCache,
  getAllCachedStatuses
} from '../cache/protobDbCache'
import { findSteamAppIdByName } from '../lib/steamSearch'
import type { GatewayAnalysis } from '../../types/gateway'

type AppOverview = {
  app_type?: number
  display_name?: string
  appid?: number
  m_unAppID?: number
}
declare const appStore: {
  GetAppOverviewByGameID(id: number): AppOverview | undefined
  GetInstalledApps?(): AppOverview[]
  m_mapApps?: Map<number, unknown>
}
declare const SteamUIStore: {
  WindowStore?: {
    GamepadUIMainWindowInstance?: { m_BrowserWindow?: { document?: Document } }
  }
}

const FETCH_TIMEOUT_MS = 2000
const BATCH_SIZE = 3
const BATCH_DELAY_MS = 3000
const GRID_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const COVER_SELECTOR = '._1pwP4eeP1zQD7PEgmsep0W'
const FOOTER_SELECTOR = '._3BPFqWN5T-x8njyrRYM1CX'
const OVERLAY_SELECTOR = '._2GRcKrPZsMSF6glMPRMZei'
const HOST_CLASS = 'protondb-grid-host'
const APP_ID_FROM_SRC = /\/(?:assets|customimages)\/(\d+)/

type NativeRoot = { render(children: React.ReactNode): void; unmount(): void }
type NativeRootCreator = (container: HTMLElement) => NativeRoot

function isSteamGame(gameId: number): boolean {
  try {
    const overview = appStore?.GetAppOverviewByGameID(gameId)
    return Boolean(appTypes[overview?.app_type as keyof typeof appTypes])
  } catch {
    return false
  }
}

function isSteamGameStrict(gameId: number): boolean {
  try {
    if (gameId >= 2000000000) return false
    return appStore?.GetAppOverviewByGameID(gameId)?.app_type === 1
  } catch {
    return false
  }
}

function getBigPictureDocument(): Document | null {
  try {
    return (
      SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.m_BrowserWindow
        ?.document ?? null
    )
  } catch {
    return null
  }
}

function getAppIdFromCover(cover: Element): string | null {
  const tile = cover.closest('[data-id]')
  if (tile) {
    const id = tile.getAttribute('data-id')
    const num = parseInt(id || '')
    if (!isNaN(num) && num > 0) return id
  }
  const img = cover.querySelector('img')
  if (img?.src) {
    const match = img.src.match(APP_ID_FROM_SRC)
    if (match && !isNaN(parseInt(match[1]))) return match[1]
  }
  return null
}

async function fetchWithTimeout(promise: Promise<Response>): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function getStatusFromCache(
  appId: string
): Promise<{ status: string; stale: boolean } | null> {
  try {
    const cached = await getCache(appId)
    if (cached?.analysis?.working_status?.status) {
      const age = cached.lastUpdated
        ? Date.now() - new Date(cached.lastUpdated).getTime()
        : Infinity
      return {
        status: cached.analysis.working_status.status,
        stale: age > GRID_CACHE_MAX_AGE_MS
      }
    }
  } catch {
    // localforage read failed
  }
  return null
}

export function initLibraryGridPatch(): () => void {
  const creators = new Set<NativeRootCreator>()
  for (const module of createModuleMapping(
    (m) => typeof m?.createRoot === 'function'
  ).values()) {
    creators.add(module.createRoot)
  }
  if (creators.size !== 1) {
    throw new Error(
      'Expected one native React createRoot export; found ' + creators.size
    )
  }
  const createRoot = creators.values().next().value as NativeRootCreator
  const statusCache = new Map<string, string>()
  const resolveCache = new Map<string, string | null>()
  const pendingIds = new Set<string>()
  const checkingIds = new Set<string>()
  const hosts = new Map<
    Element,
    { host: HTMLElement; footer: Element; appId: string; key: number }
  >()
  const affected = new Set<Element>()
  const delays = new Map<ReturnType<typeof setTimeout>, () => void>()
  let disposed = false
  let enabled = false
  let focusOnly = false
  let position: 'bl' | 'tl' | 'tr' = 'bl'
  let cacheLoaded = false
  let isFetching = false
  let refreshCounter = 0
  let refreshIntervalSecs = 60
  let refreshing = false
  let document: Document | null = null
  let root: NativeRoot | null = null
  let style: HTMLStyleElement | null = null
  let observer: MutationObserver | null = null
  let renderQueued = false
  let observerQueued = false
  let nextKey = 0
  let startupTimer: ReturnType<typeof setTimeout> | undefined

  function queueRender(): void {
    if (disposed || !root || renderQueued) return
    renderQueued = true
    queueMicrotask(() => {
      renderQueued = false
      if (disposed || !root) return
      root.render(
        Array.from(hosts.values(), (entry) =>
          createPortal(
            createElement(LibraryGridIcon, {
              appId: entry.appId,
              status: statusCache.get(entry.appId),
              position,
              focusOnly
            }),
            entry.host,
            String(entry.key)
          )
        )
      )
    })
  }

  function publishStatus(key: string, status: string): void {
    if (disposed || statusCache.get(key) === status) return
    statusCache.set(key, status)
    queueRender()
  }

  function reconcile(cover: Element): void {
    const existing = hosts.get(cover)
    const appId = getAppIdFromCover(cover)
    const footer = cover.querySelector(FOOTER_SELECTOR)
    const overlay = footer?.closest(OVERLAY_SELECTOR)
    const valid =
      cover.isConnected &&
      cover.ownerDocument === document &&
      appId &&
      footer &&
      overlay &&
      cover.contains(overlay)
    if (
      existing &&
      (!valid ||
        existing.footer !== footer ||
        existing.host.parentElement !== footer)
    ) {
      existing.host.remove()
      hosts.delete(cover)
      queueRender()
    }
    if (!valid || !document) return
    const entry = hosts.get(cover)
    if (!entry) {
      const host = document.createElement('div')
      host.className = HOST_CLASS
      footer.prepend(host)
      hosts.set(cover, { host, footer, appId, key: nextKey++ })
      queueRender()
      if (cacheLoaded) void loadStatus(appId)
    } else if (entry.appId !== appId) {
      entry.appId = appId
      queueRender()
      if (cacheLoaded) void loadStatus(appId)
    }
  }

  function collect(node: Node): void {
    if (node.nodeType !== 1) return
    const element = node as Element
    // Host insertion/removal must reach the cover, but React's children must not.
    if (
      element.closest(`.${HOST_CLASS}`) &&
      !element.classList.contains(HOST_CLASS)
    )
      return
    const cover = element.closest(COVER_SELECTOR)
    if (cover) affected.add(cover)
    for (const child of element.querySelectorAll(COVER_SELECTOR))
      affected.add(child)
  }

  function detachDocument(): void {
    observer?.disconnect()
    observer = null
    affected.clear()
    root?.unmount()
    root = null
    for (const entry of hosts.values()) entry.host.remove()
    hosts.clear()
    style?.remove()
    style = null
    document = null
  }

  function syncDocument(): void {
    if (disposed) return
    const nextDocument = enabled ? getBigPictureDocument() : null
    if (nextDocument === document) return
    detachDocument()
    if (!nextDocument?.body) return
    document = nextDocument
    root = createRoot(document.createElement('div'))
    style = document.createElement('style')
    style.id = 'protondb-grid-icons-style'
    style.textContent = libraryGridIconCss
    document.head.appendChild(style)
    observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element
        if (target.closest?.(`.${HOST_CLASS}`)) continue
        collect(target)
        for (const node of record.addedNodes) collect(node)
        for (const node of record.removedNodes) collect(node)
      }
      if (observerQueued || disposed) return
      observerQueued = true
      queueMicrotask(() => {
        observerQueued = false
        if (disposed || !document) return
        for (const [cover, entry] of hosts) {
          if (
            !cover.isConnected ||
            !entry.footer.isConnected ||
            entry.host.parentElement !== entry.footer ||
            !cover.contains(entry.footer)
          )
            affected.add(cover)
        }
        const covers = Array.from(affected)
        affected.clear()
        for (const cover of covers) reconcile(cover)
      })
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-id']
    })
    for (const cover of document.querySelectorAll(COVER_SELECTOR))
      reconcile(cover)
  }

  function delay(ms: number): Promise<void> {
    if (disposed) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        delays.delete(timer)
        resolve()
      }, ms)
      delays.set(timer, resolve)
    })
  }

  async function resolveToSteamAppId(rawId: string): Promise<string | null> {
    if (disposed || !enabled) return null
    if (resolveCache.has(rawId)) return resolveCache.get(rawId) ?? null
    const num = parseInt(rawId)
    if (!isNaN(num) && isSteamGame(num)) {
      resolveCache.set(rawId, rawId)
      return rawId
    }
    try {
      const name = appStore?.GetAppOverviewByGameID(num)?.display_name
      if (name) {
        const steamId = await findSteamAppIdByName(name)
        if (!disposed) resolveCache.set(rawId, steamId)
        return steamId
      }
    } catch {
      // Name lookup failed.
    }
    if (!disposed) resolveCache.set(rawId, null)
    return null
  }

  async function cacheUnknown(appId: string): Promise<void> {
    if (disposed) return
    try {
      const existing = await getCache(appId)
      if (!disposed && !existing?.analysis) {
        // The existing cache accepts a status-only analysis for titles without reports.
        const analysis = {
          working_status: { status: 'unknown' }
        } as unknown as GatewayAnalysis
        await updateCache(appId, {
          analysis,
          lastUpdated: new Date().toISOString()
        })
      }
    } catch {
      // localforage write failed
    }
  }

  async function fetchAndCacheStatus(appId: string): Promise<string | null> {
    if (disposed || !enabled || !/^\d+$/.test(appId) || Number(appId) <= 0)
      return null
    let hasReports = false
    try {
      const res = await fetchWithTimeout(
        fetchNoCors(
          `https://www.protondb.com/api/v1/reports/summaries/${appId}.json`
        )
      )
      if (disposed) return null
      if (res.status === 200) {
        const data = await res.json()
        if (disposed) return null
        hasReports = !!data?.tier
      }
    } catch {
      // Summary unavailable.
    }
    if (disposed || !enabled) return null
    if (!hasReports) {
      await cacheUnknown(appId)
      return 'unknown'
    }
    try {
      const url = `${GATEWAY_BASE_URL}/api/v1/analysis/${appId}?user_gpu_vendor=amd&user_proton_version=10`
      const res = await fetchWithTimeout(
        fetchNoCors(url, {
          method: 'GET',
          headers: { 'X-API-Key': GATEWAY_API_KEY }
        })
      )
      if (disposed) return null
      if (res.status === 200) {
        const data = await res.json()
        if (disposed) return null
        if (!data || typeof data !== 'object' || !data.working_status) {
          await cacheUnknown(appId)
          return 'unknown'
        }
        const status = data.working_status.status || 'unknown'
        // Keep the existing partial-cache contract: no placeholder tier.
        await updateCache(appId, {
          analysis: data,
          lastUpdated: new Date().toISOString()
        })
        return status
      }
    } catch {
      // Analysis unavailable.
    }
    if (disposed) return null
    await cacheUnknown(appId)
    return 'unknown'
  }

  async function loadStatus(rawId: string): Promise<void> {
    if (
      disposed ||
      !enabled ||
      !cacheLoaded ||
      statusCache.has(rawId) ||
      checkingIds.has(rawId) ||
      pendingIds.has(rawId)
    )
      return
    checkingIds.add(rawId)
    try {
      const steamId = await resolveToSteamAppId(rawId)
      if (
        disposed ||
        !enabled ||
        !steamId ||
        !/^\d+$/.test(steamId) ||
        Number(steamId) <= 0
      )
        return
      const disk = await getStatusFromCache(steamId)
      if (disposed) return
      if (disk) publishStatus(rawId, disk.status)
      if (!disk || disk.stale) pendingIds.add(rawId)
    } finally {
      checkingIds.delete(rawId)
      if (!disposed && enabled) void processBatch()
    }
  }

  async function processBatch(): Promise<void> {
    if (disposed || !enabled || isFetching || !pendingIds.size) return
    isFetching = true
    try {
      while (!disposed && enabled && pendingIds.size) {
        const batch = Array.from(pendingIds).slice(0, BATCH_SIZE)
        for (const rawId of batch) {
          if (disposed || !enabled) return
          try {
            const steamId = resolveCache.get(rawId)
            if (!steamId) {
              pendingIds.delete(rawId)
              continue
            }
            const status = await fetchAndCacheStatus(steamId)
            if (disposed) return
            if (status !== null) {
              publishStatus(rawId, status)
              pendingIds.delete(rawId)
            } else if (enabled) {
              pendingIds.delete(rawId)
            }
          } catch {
            pendingIds.delete(rawId)
          }
        }
        if (!disposed && enabled && pendingIds.size) await delay(BATCH_DELAY_MS)
      }
    } finally {
      isFetching = false
    }
  }

  async function refreshUnknownStatuses(): Promise<void> {
    if (refreshing) return
    refreshing = true
    try {
      for (const [appId, status] of statusCache) {
        if (disposed || !enabled) return
        if (status !== 'unknown') continue
        const disk = await getStatusFromCache(appId)
        if (disk && disk.status !== 'unknown') publishStatus(appId, disk.status)
      }
      refreshIntervalSecs = 300
    } finally {
      refreshing = false
    }
  }

  async function prefetchLibrary(): Promise<void> {
    if (disposed || !enabled) return
    try {
      const allApps: number[] = []
      try {
        for (const app of appStore?.GetInstalledApps?.() ?? []) {
          const id = app?.appid ?? app?.m_unAppID
          if (id && isSteamGameStrict(id)) allApps.push(id)
        }
      } catch {
        // appStore unavailable.
      }
      if (!allApps.length) {
        try {
          appStore?.m_mapApps?.forEach((_value: unknown, key: number) => {
            if (isSteamGameStrict(key)) allApps.push(key)
          })
        } catch {
          // Fallback unavailable.
        }
      }
      const uncached: string[] = []
      for (const id of allApps) {
        if (disposed || !enabled) return
        const key = String(id)
        const mem = statusCache.get(key)
        if (mem && mem !== 'unknown') continue
        const disk = await getStatusFromCache(key)
        if (disposed || !enabled) return
        if (disk && !disk.stale && disk.status !== 'unknown')
          publishStatus(key, disk.status)
        else uncached.push(key)
      }
      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        for (const appId of uncached.slice(i, i + BATCH_SIZE)) {
          if (disposed || !enabled) return
          const status = await fetchAndCacheStatus(appId)
          if (status !== null) publishStatus(appId, status)
        }
        if (!disposed && enabled && i + BATCH_SIZE < uncached.length)
          await delay(BATCH_DELAY_MS)
      }
    } catch {
      // Prefetch must not affect the other plugin features.
    }
  }

  const subscription = SettingsContext.subscribe((settings) => {
    const nextEnabled = settings.showLibraryIcons === true
    const nextFocusOnly = settings.libraryIconsOnFocusOnly === true
    const nextPosition =
      settings.libraryIconPosition === 'tl' ||
      settings.libraryIconPosition === 'tr'
        ? settings.libraryIconPosition
        : 'bl'
    const changed =
      nextEnabled !== enabled ||
      nextFocusOnly !== focusOnly ||
      nextPosition !== position
    if (!changed || disposed) return
    const enabling = nextEnabled && !enabled
    enabled = nextEnabled
    focusOnly = nextFocusOnly
    position = nextPosition
    syncDocument()
    queueRender()
    if (enabling && cacheLoaded) {
      for (const entry of hosts.values()) void loadStatus(entry.appId)
      void processBatch()
    }
  })
  const maintenance = setInterval(() => {
    syncDocument()
    if (disposed || !enabled || !statusCache.size) return
    if (++refreshCounter >= refreshIntervalSecs) {
      refreshCounter = 0
      void refreshUnknownStatuses()
    }
  }, 1000)
  getAllCachedStatuses()
    .then((cached) =>
      cached.forEach((status, appId) => publishStatus(appId, status))
    )
    .catch(() => {})
    .finally(() => {
      if (disposed) return
      cacheLoaded = true
      for (const entry of hosts.values()) void loadStatus(entry.appId)
      startupTimer = setTimeout(() => {
        startupTimer = undefined
        void prefetchLibrary()
      }, 5000)
    })

  return () => {
    if (disposed) return
    disposed = true
    subscription.unsubscribe()
    clearInterval(maintenance)
    clearTimeout(startupTimer)
    for (const [timer, resolve] of delays) {
      clearTimeout(timer)
      resolve()
    }
    delays.clear()
    detachDocument()
    statusCache.clear()
    resolveCache.clear()
    pendingIds.clear()
    checkingIds.clear()
  }
}
