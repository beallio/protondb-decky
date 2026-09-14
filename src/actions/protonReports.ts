import { fetchNoCors } from '@decky/api'
import { getCachedReports, setCachedReports } from '../cache/protobDbCache'
import type {
  CommunityReport,
  ReportDataset,
  ReportDevice,
  ReportPage,
  ReportRequest
} from '../../types/protonReports'

const DATA_BASE_URL = 'https://www.protondb.com/data'
const COUNTS_URL = `${DATA_BASE_URL}/counts.json`
const FETCH_TIMEOUT_MS = 5000
const DATASET_MAX_AGE_MS = 60 * 60 * 1000

export const reportLifetime = new AbortController()

type UnknownRecord = Record<string, unknown>

type CachedDataset = {
  data: ReportDataset
  fetchedAt: number
}

let cachedDataset: CachedDataset | undefined
let datasetPromise: Promise<ReportDataset> | undefined

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function parseDataset(value: unknown, source: string): ReportDataset {
  if (!isRecord(value)) {
    throw new Error(`Invalid ProtonDB ${source}`)
  }

  const { reports, timestamp } = value
  if (!isNonNegativeSafeInteger(reports) || !isPositiveSafeInteger(timestamp)) {
    throw new Error(`Invalid ProtonDB ${source}`)
  }

  return { reports, timestamp }
}

function datasetsEqual(a: ReportDataset, b: ReportDataset): boolean {
  return a.reports === b.reports && a.timestamp === b.timestamp
}

function requestIsCurrent(request: ReportRequest): boolean {
  if (reportLifetime.signal.aborted) return false
  try {
    return request.isCurrent() === true
  } catch {
    return false
  }
}

function ensureCurrent(request: ReportRequest): void {
  if (!requestIsCurrent(request)) {
    throw new Error('Report request was cancelled')
  }
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('ProtonDB report request timed out')),
        FETCH_TIMEOUT_MS
      )
    })
    return await Promise.race([fetchNoCors(url, init), timeout])
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('ProtonDB report request failed')
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function readJson(response: Response, source: string): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error(`Invalid JSON from ProtonDB ${source}`)
  }
}

async function fetchDataset(refresh: boolean): Promise<ReportDataset> {
  if (reportLifetime.signal.aborted) {
    throw new Error('Report request was cancelled')
  }

  const response = await fetchWithTimeout(COUNTS_URL, {
    method: 'GET',
    ...(refresh ? { cache: 'no-store' as RequestCache } : {})
  })

  if (reportLifetime.signal.aborted) {
    throw new Error('Report request was cancelled')
  }
  if (response.status !== 200) {
    throw new Error(
      `Failed to load ProtonDB report metadata (HTTP ${response.status})`
    )
  }

  const data = await readJson(response, 'report metadata')
  if (reportLifetime.signal.aborted) {
    throw new Error('Report request was cancelled')
  }
  return parseDataset(data, 'report metadata')
}

async function getDataset(refresh = false): Promise<ReportDataset> {
  const now = Date.now()
  if (
    !refresh &&
    cachedDataset &&
    now >= cachedDataset.fetchedAt &&
    now - cachedDataset.fetchedAt < DATASET_MAX_AGE_MS
  ) {
    return cachedDataset.data
  }

  if (datasetPromise) {
    return datasetPromise
  }

  const pending = fetchDataset(refresh)
  datasetPromise = pending
  try {
    const data = await pending
    if (!reportLifetime.signal.aborted) {
      cachedDataset = { data, fetchedAt: Date.now() }
    }
    return data
  } finally {
    if (datasetPromise === pending) datasetPromise = undefined
  }
}

function reportFileId(
  appId: number,
  page: number,
  dataset: ReportDataset
): number {
  const part = (a: number, b: number) => `${b}p${a * (b % dataset.timestamp)}`
  // Matches ProtonDB's deployed helper; the literal suffix is intentional.
  const input =
    `p${part(appId, dataset.reports)}` + `*vRT${part(page, appId)}undefinedm`

  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function parseReportedAppId(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number' && isPositiveSafeInteger(value)) return value
  // Older questionnaires stored a free-text game title, not an app ID.
  if (typeof value === 'string' && !/^\d+$/.test(value)) return undefined
  if (typeof value !== 'string') return null

  const parsed = Number(value)
  return isPositiveSafeInteger(parsed) ? parsed : null
}

const NOTE_LABELS: Record<string, string> = {
  audioFaults: 'Audio',
  batteryPerformance: 'Battery',
  controlLayout: 'Controls',
  controlLayoutCustomization: 'Controls',
  customizationsUsed: 'Customizations',
  graphicalFaults: 'Graphics',
  inputFaults: 'Input',
  launcher: 'Launcher',
  localMultiplayerAppraisal: 'Local multiplayer',
  onlineMultiplayerAppraisal: 'Online multiplayer',
  performanceFaults: 'Performance',
  readability: 'Readability',
  saveGameFaults: 'Saves',
  secondaryLauncher: 'Launcher',
  significantBugs: 'Bugs',
  stabilityFaults: 'Stability',
  tinkerOverride: 'Tinkering',
  windowingFaults: 'Windowing'
}

function noteLabel(path: string[]): string {
  for (let i = path.length - 1; i >= 0; i--) {
    const known = NOTE_LABELS[path[i]]
    if (known) return known
  }

  const key = path[path.length - 1] || 'Notes'
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function collectNoteText(
  value: unknown,
  path: string[],
  result: Array<{ path: string[]; value: string }>
): void {
  const valueText = text(value)
  if (valueText) {
    result.push({ path, value: valueText })
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectNoteText(entry, path, result))
    return
  }
  if (!isRecord(value)) return

  Object.entries(value).forEach(([key, entry]) =>
    collectNoteText(entry, [...path, key], result)
  )
}

function normalizeNotes(responses: UnknownRecord): string | undefined {
  const notes = responses.notes
  const notesRecord = isRecord(notes) ? notes : undefined
  const parts: string[] = []
  const seen = new Set<string>()

  const add = (value: unknown, label?: string) => {
    const valueText = text(value)
    if (!valueText || seen.has(valueText)) return
    seen.add(valueText)
    parts.push(label ? `${label}: ${valueText}` : valueText)
  }

  if (typeof notes === 'string') add(notes)
  add(notesRecord?.verdict)
  add(notesRecord?.finalVerdict)
  add(responses.concludingNotes)
  add(notesRecord?.concludingNotes)

  if (notesRecord) {
    const structured: Array<{ path: string[]; value: string }> = []
    Object.entries(notesRecord).forEach(([key, value]) => {
      if (
        key === 'verdict' ||
        key === 'finalVerdict' ||
        key === 'concludingNotes' ||
        key === 'variant'
      ) {
        return
      }
      collectNoteText(value, [key], structured)
    })
    structured.forEach((entry) => add(entry.value, noteLabel(entry.path)))
  }

  return parts.length > 0 ? parts.join('\n') : undefined
}

function normalizeProtonVersion(responses: UnknownRecord): string | undefined {
  const variant = text(responses.variant)
  const notes = isRecord(responses.notes) ? responses.notes : undefined
  const customVersion = text(responses.customProtonVersion)

  if (variant === 'native') return undefined
  if (customVersion) return customVersion
  if (variant === 'notListed') {
    const namedVersion = text(notes?.variant)
    if (namedVersion) return namedVersion
  }
  if (variant === 'experimental') return 'Experimental'
  return text(responses.protonVersion)
}

function normalizeOutcome(
  responses: UnknownRecord
): CommunityReport['outcome'] {
  if (responses.verdict === 'yes') return 'working'
  if (responses.verdict === 'no') return 'issues'
  if (responses.verdict !== undefined && responses.verdict !== null) {
    return 'unknown'
  }

  const legacyMedal = text(responses.medalRating)?.toLowerCase()
  if (
    legacyMedal === 'platinum' ||
    legacyMedal === 'gold' ||
    legacyMedal === 'silver'
  ) {
    return 'working'
  }
  if (legacyMedal === 'bronze' || legacyMedal === 'borked') return 'issues'
  return 'unknown'
}

function normalizeReport(
  value: unknown,
  index: number,
  appId: string,
  appIdNumber: number,
  device: ReportDevice
): CommunityReport {
  if (!isRecord(value)) {
    throw new Error(`Invalid ProtonDB report at index ${index}`)
  }

  const id = text(value.id)
  if (!id || !isPositiveSafeInteger(value.timestamp)) {
    throw new Error(`Invalid ProtonDB report at index ${index}`)
  }
  if (!isRecord(value.responses)) {
    throw new Error(`Invalid ProtonDB report responses at index ${index}`)
  }

  const currentAppId = parseReportedAppId(value.responses.answerToWhatGame)
  const legacyAppId = parseReportedAppId(value.answerToWhatGame)
  if (
    (currentAppId !== undefined && currentAppId !== appIdNumber) ||
    (legacyAppId !== undefined && legacyAppId !== appIdNumber)
  ) {
    throw new Error(`ProtonDB returned a report for the wrong game (${appId})`)
  }

  let hardwareType: string | undefined
  let os: string | undefined
  if (value.device !== undefined && value.device !== null) {
    if (!isRecord(value.device)) {
      throw new Error(`Invalid ProtonDB report device at index ${index}`)
    }
    if (
      value.device.hardwareType !== undefined &&
      value.device.hardwareType !== null
    ) {
      if (typeof value.device.hardwareType !== 'string') {
        throw new Error(`Invalid ProtonDB report device at index ${index}`)
      }
      hardwareType = value.device.hardwareType
    }

    const inferred = value.device.inferred
    if (inferred !== undefined && inferred !== null) {
      if (!isRecord(inferred)) {
        throw new Error(`Invalid ProtonDB report device at index ${index}`)
      }
      const steam = inferred.steam
      if (steam !== undefined && steam !== null) {
        if (!isRecord(steam)) {
          throw new Error(`Invalid ProtonDB report device at index ${index}`)
        }
        if (steam.os !== undefined && steam.os !== null) {
          if (typeof steam.os !== 'string') {
            throw new Error(`Invalid ProtonDB report OS at index ${index}`)
          }
          os = text(steam.os)
        }
      }
    }
  }

  if (device === 'steam-deck' && hardwareType && hardwareType !== 'steamDeck') {
    throw new Error('ProtonDB returned a non-Steam-Deck report for Steam Deck')
  }

  return {
    id,
    timestamp: value.timestamp,
    outcome: normalizeOutcome(value.responses),
    notes: normalizeNotes(value.responses),
    protonVersion: normalizeProtonVersion(value.responses),
    os,
    isSteamDeck: device === 'steam-deck' || hardwareType === 'steamDeck'
  }
}

function normalizePage(
  value: unknown,
  appId: string,
  appIdNumber: number,
  device: ReportDevice,
  dataset: ReportDataset,
  requestedPage: number
): ReportPage {
  if (!isRecord(value) || !Array.isArray(value.reports)) {
    throw new Error('Invalid ProtonDB report response')
  }

  const { page, perPage, total } = value
  if (
    page !== requestedPage ||
    !isPositiveSafeInteger(page) ||
    !isPositiveSafeInteger(perPage) ||
    !isNonNegativeSafeInteger(total) ||
    page > Math.max(1, Math.ceil(total / perPage)) ||
    value.reports.length !== Math.min(perPage, total - (page - 1) * perPage)
  ) {
    throw new Error('Invalid ProtonDB report pagination')
  }

  const reports = value.reports.map((report, index) =>
    normalizeReport(report, index, appId, appIdNumber, device)
  )

  return {
    appId,
    device,
    dataset,
    page,
    perPage,
    total,
    reports
  }
}

async function loadPage(
  request: ReportRequest,
  appId: string,
  appIdNumber: number,
  device: ReportDevice,
  dataset: ReportDataset,
  page: number,
  mayRefreshMetadata: boolean
): Promise<ReportPage> {
  ensureCurrent(request)
  const cached = await getCachedReports(appId, device, dataset, page)
  ensureCurrent(request)
  if (cached) return cached

  ensureCurrent(request)
  const fileId = reportFileId(appIdNumber, page, dataset)
  const url = `${DATA_BASE_URL}/reports/${device}/app/${fileId}.json`
  const response = await fetchWithTimeout(url, { method: 'GET' })
  ensureCurrent(request)

  if (response.status === 404 && mayRefreshMetadata) {
    const refreshedDataset = await getDataset(true)
    ensureCurrent(request)
    if (datasetsEqual(dataset, refreshedDataset)) {
      throw new Error('ProtonDB report metadata did not change after a 404')
    }

    return loadPage(
      request,
      appId,
      appIdNumber,
      device,
      refreshedDataset,
      page > 1 ? 1 : page,
      false
    )
  }
  if (response.status !== 200) {
    throw new Error(`Failed to load ProtonDB reports (HTTP ${response.status})`)
  }

  const data = await readJson(response, 'report page')
  ensureCurrent(request)
  const normalized = normalizePage(
    data,
    appId,
    appIdNumber,
    device,
    dataset,
    page
  )
  ensureCurrent(request)
  await setCachedReports(normalized, () => requestIsCurrent(request))
  ensureCurrent(request)
  return normalized
}

function validateRequest(request: ReportRequest): {
  appId: string
  appIdNumber: number
  device: ReportDevice
  page: number
  dataset?: ReportDataset
} {
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid report request')
  }
  if (typeof request.appId !== 'string' || !/^[1-9]\d*$/.test(request.appId)) {
    throw new Error('Invalid Steam app ID for reports')
  }

  const appIdNumber = Number(request.appId)
  if (!isPositiveSafeInteger(appIdNumber)) {
    throw new Error('Invalid Steam app ID for reports')
  }
  if (request.device !== 'steam-deck' && request.device !== 'all-devices') {
    throw new Error('Invalid ProtonDB report device')
  }
  if (!isPositiveSafeInteger(request.page)) {
    throw new Error('Invalid ProtonDB report page')
  }
  if (typeof request.isCurrent !== 'function') {
    throw new Error('Invalid report request lifetime')
  }

  const dataset =
    request.dataset === undefined
      ? undefined
      : parseDataset(request.dataset, 'report dataset')
  if (request.page > 1 && !dataset) {
    throw new Error('A report dataset is required after page 1')
  }

  return {
    appId: request.appId,
    appIdNumber,
    device: request.device,
    page: request.page,
    dataset
  }
}

export async function getReportPage(
  request: ReportRequest
): Promise<ReportPage> {
  const {
    appId,
    appIdNumber,
    device,
    page,
    dataset: suppliedDataset
  } = validateRequest(request)
  ensureCurrent(request)

  const dataset = suppliedDataset || (await getDataset())
  ensureCurrent(request)
  return loadPage(request, appId, appIdNumber, device, dataset, page, true)
}
