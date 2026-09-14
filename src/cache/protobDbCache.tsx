import localforage from 'localforage'
import ProtonDBTier from '../../types/ProtonDBTier'
import { GatewayAnalysis, ProtonVersionsResponse } from '../../types/gateway'
import {
  ReportDataset,
  ReportDevice,
  ReportPage
} from '../../types/protonReports'

const STORAGE_KEY = 'protondb-badges-cache'
const REPORTS_STORAGE_KEY = 'protondb-reports-cache'

localforage.config({
  name: STORAGE_KEY
})

const reportsStore = localforage.createInstance({
  name: REPORTS_STORAGE_KEY
})

const VERSIONS_STORAGE_KEY = 'protondb-versions-cache'
const versionsStore = localforage.createInstance({
  name: VERSIONS_STORAGE_KEY
})

type CachedVersions = {
  data: ProtonVersionsResponse
  lastUpdated: string
}

type CachedReports = {
  data: ReportPage
  lastUpdated: string
}

type ProtonDBCache = {
  tier: ProtonDBTier
  linuxSupport: boolean
  analysis?: GatewayAnalysis
  lastUpdated: string
}

export async function updateCache(
  appId: string,
  newData: Partial<ProtonDBCache>
) {
  const oldCache = await localforage.getItem<ProtonDBCache>(appId)
  const newCache = { ...oldCache, ...newData } as ProtonDBCache
  await localforage.setItem(appId, newCache)
  return newCache
}

export function clearCache(appId?: string) {
  if (appId?.length) {
    localforage.removeItem(appId)
    void clearReportsCache(appId)
    versionsStore.removeItem(appId)
  } else {
    localforage.clear()
    void clearReportsCache()
    versionsStore.clear()
  }
}

export async function getCache(appId: string): Promise<ProtonDBCache | null> {
  const data = await localforage.getItem<ProtonDBCache>(appId)
  return data
}

export async function getAllCachedStatuses(): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  await localforage.iterate<ProtonDBCache, void>((value, key) => {
    const status = value?.analysis?.working_status?.status
    if (status) {
      result.set(key, status)
    }
  })
  return result
}

const REPORTS_MAX_AGE_MS = 60 * 60 * 1000

function reportCacheKey(
  appId: string,
  device: ReportDevice,
  dataset: ReportDataset,
  page: number
): string {
  return `v2:${appId}:${device}:${dataset.reports}:${dataset.timestamp}:${page}`
}

export async function getCachedReports(
  appId: string,
  device: ReportDevice,
  dataset: ReportDataset,
  page: number
): Promise<ReportPage | null> {
  try {
    const cached = await reportsStore.getItem<CachedReports>(
      reportCacheKey(appId, device, dataset, page)
    )
    if (!cached) return null
    const age = Date.now() - new Date(cached.lastUpdated).getTime()
    const data = cached.data
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age >= REPORTS_MAX_AGE_MS ||
      data?.appId !== appId ||
      data.device !== device ||
      data.dataset?.reports !== dataset.reports ||
      data.dataset?.timestamp !== dataset.timestamp ||
      data.page !== page ||
      !Number.isSafeInteger(data.perPage) ||
      data.perPage <= 0 ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      !Array.isArray(data.reports) ||
      page > Math.max(1, Math.ceil(data.total / data.perPage)) ||
      data.reports.length !==
        Math.min(data.perPage, data.total - (page - 1) * data.perPage) ||
      !data.reports.every(
        (report) =>
          report &&
          typeof report.id === 'string' &&
          report.id.length > 0 &&
          Number.isSafeInteger(report.timestamp) &&
          report.timestamp > 0 &&
          (report.outcome === 'working' ||
            report.outcome === 'issues' ||
            report.outcome === 'unknown') &&
          typeof report.isSteamDeck === 'boolean' &&
          (device !== 'steam-deck' || report.isSteamDeck) &&
          (report.notes === undefined || typeof report.notes === 'string') &&
          (report.protonVersion === undefined ||
            typeof report.protonVersion === 'string') &&
          (report.os === undefined || typeof report.os === 'string')
      )
    )
      return null
    return data
  } catch {
    return null
  }
}

export async function setCachedReports(
  data: ReportPage,
  isCurrent: () => boolean
): Promise<void> {
  try {
    if (!isCurrent()) return
    await reportsStore.removeItem(data.appId)
    if (!isCurrent()) return
    await reportsStore.setItem<CachedReports>(
      reportCacheKey(data.appId, data.device, data.dataset, data.page),
      {
        data,
        lastUpdated: new Date().toISOString()
      }
    )
  } catch {
    /* storage full or unavailable — non-critical */
  }
}

export async function clearReportsCache(appId?: string): Promise<void> {
  try {
    if (appId) {
      const prefix = `v2:${appId}:`
      const keys = await reportsStore.keys()
      await Promise.all(
        keys
          .filter((key) => key === appId || key.startsWith(prefix))
          .map((key) => reportsStore.removeItem(key))
      )
    } else {
      await reportsStore.clear()
    }
  } catch {
    /* storage unavailable — non-critical */
  }
}

export async function getCachedVersions(
  appId: string
): Promise<ProtonVersionsResponse | null> {
  try {
    const cached = await versionsStore.getItem<CachedVersions>(appId)
    if (!cached?.data?.versions) return null
    const age = Date.now() - new Date(cached.lastUpdated).getTime()
    if (age > REPORTS_MAX_AGE_MS) return null
    return cached.data
  } catch {
    return null
  }
}

export async function setCachedVersions(
  appId: string,
  data: ProtonVersionsResponse
): Promise<void> {
  try {
    await versionsStore.setItem<CachedVersions>(appId, {
      data,
      lastUpdated: new Date().toISOString()
    })
  } catch {
    /* storage full or unavailable — non-critical */
  }
}
