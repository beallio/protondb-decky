import {
  ConfirmModal,
  DropdownItem,
  Focusable,
  Navigation,
  ScrollPanelGroup,
  ScrollPanel
} from '@decky/ui'
import React, {
  CSSProperties,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  GatewayAnalysis,
  ReportHistory,
  ProtonVersionsResponse,
  ProtonVersionStat as GwVersionStat,
  SettingsTipsResponse,
  LaunchOptionStat
} from '../../../types/gateway'
import {
  CommunityReport,
  ReportDataset,
  ReportDevice,
  ReportPage,
  ReportRequest
} from '../../../types/protonReports'
import {
  getReportHistory,
  getProtonVersions,
  getSettingsTips
} from '../../actions/gateway'
import { getReportPage, reportLifetime } from '../../actions/protonReports'
import { getCachedVersions, setCachedVersions } from '../../cache/protobDbCache'
import ReportChart from './ReportChart'
import useTranslations from '../../hooks/useTranslations'
import {
  getCurrentLaunchOptions,
  setLaunchOptions,
  buildMergedOptions
} from '../../utils/steamLaunchOptions'
import {
  getInstalledCompatTools,
  findMatchingTool,
  applyCompatTool,
  getCurrentCompatTool,
  isDowngrade,
  lastDebugInfo
} from '../../utils/compatTools'

const CURRENT_PROTON_MAJOR = '10'
const REPORTS_DISPLAY_INCREMENT = 5
const REPORT_DEVICE_OPTIONS: ReadonlyArray<{
  data: number
  device: ReportDevice
  label: string
}> = [
  { data: 0, device: 'steam-deck', label: 'Steam Deck' },
  { data: 1, device: 'all-devices', label: 'All systems' }
]
const REPORT_DEVICE_DROPDOWN_OPTIONS = REPORT_DEVICE_OPTIONS.map(
  ({ data, label }) => ({ data, label })
)

interface ReportsViewState {
  scope: string
  loaded: boolean
  dataset?: ReportDataset
  page: number
  perPage: number
  total: number
  reports: CommunityReport[]
  visible: number
  loadingPage?: number
  errorPage?: number
}

interface ActiveReportRequest {
  token: number
  scope: string
  page: number
  dataset?: ReportDataset
}
type AnalysisTab = 'details' | 'chart' | 'reports' | 'versions' | 'settings'

function reportScope(appId: string, device: ReportDevice): string {
  return `${appId}:${device}`
}

function emptyReportsView(
  appId: string,
  device: ReportDevice
): ReportsViewState {
  return {
    scope: reportScope(appId, device),
    loaded: false,
    page: 0,
    perPage: 0,
    total: 0,
    reports: [],
    visible: REPORTS_DISPLAY_INCREMENT
  }
}

function sameDataset(
  left: ReportDataset | undefined,
  right: ReportDataset
): boolean {
  return (
    !!left &&
    left.reports === right.reports &&
    left.timestamp === right.timestamp
  )
}

function appendUniqueReports(
  current: CommunityReport[],
  incoming: CommunityReport[]
): CommunityReport[] {
  const ids = new Set(current.map((report) => report.id))
  const appended = incoming.filter((report) => {
    if (ids.has(report.id)) return false
    ids.add(report.id)
    return true
  })
  return appended.length > 0 ? [...current, ...appended] : current
}

interface AnalysisModalProps {
  analysis: GatewayAnalysis
  appId: string
  closeModal?: () => void
}

const TREND_ICONS: Record<string, string> = {
  improving: '🟢',
  declining: '🔴',
  stable: '⚪',
  unknown: '❓'
}

const WORKING_STATUS_ICONS: Record<string, string> = {
  working: '✅',
  not_working: '❌',
  unknown: '❓'
}

function formatPercent(ratio: number | undefined): string {
  if (ratio === undefined || ratio === null) return '—'
  return `${(ratio * 100).toFixed(1)}%`
}

const rowStyle = (even: boolean): CSSProperties => ({
  display: 'flex',
  background: even ? 'rgba(255,255,255,0.04)' : 'transparent',
  fontSize: '13px',
  color: '#e0e0e0'
})

const labelStyle = (sub: boolean): CSSProperties => ({
  padding: sub ? '6px 10px 6px 20px' : '6px 10px',
  fontWeight: 'bold',
  color: sub ? '#888888' : '#c0c0c0',
  width: '220px',
  minWidth: '220px',
  flexShrink: 0
})

const valueStyle: CSSProperties = {
  padding: '6px 10px',
  flex: 1
}

type RowProps = {
  label: string
  value: ReactNode
  even: boolean
  sub?: boolean
}

const Row: FC<RowProps> = ({ label, value, even, sub }) => (
  <div style={rowStyle(even)}>
    <div style={labelStyle(!!sub)}>{label}</div>
    <div style={valueStyle}>{value}</div>
  </div>
)

const tabStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: '8px 0',
  textAlign: 'center',
  fontSize: '13px',
  fontWeight: 'bold',
  color: active ? '#fff' : '#888',
  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
  borderBottom: active ? '2px solid #7ab3f0' : '2px solid transparent',
  cursor: 'pointer',
  border: 'none',
  borderRadius: 0
})

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

const REPORT_OUTCOME_STYLE: Record<
  CommunityReport['outcome'],
  { color: string; label: string }
> = {
  working: { color: '#4ade80', label: '👍 Works' },
  issues: { color: '#f87171', label: '👎 Issues' },
  unknown: { color: '#aaa', label: 'Unknown' }
}

const ReportCard: FC<{ report: CommunityReport }> = ({ report }) => {
  const outcome = REPORT_OUTCOME_STYLE[report.outcome]

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '6px',
        padding: '10px 12px',
        marginBottom: '8px',
        borderLeft: `3px solid ${outcome.color}`
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px'
        }}
      >
        <span
          style={{
            fontWeight: 'bold',
            color: outcome.color,
            fontSize: '13px'
          }}
        >
          {outcome.label}
        </span>
        <span style={{ color: '#888', fontSize: '11px' }}>
          {formatDate(report.timestamp)}
        </span>
      </div>
      <div
        style={{
          fontSize: '11px',
          color: '#aaa',
          marginBottom: '4px',
          textAlign: 'right'
        }}
      >
        {[
          report.os ? `OS: ${report.os}` : null,
          report.protonVersion ? `Proton: ${report.protonVersion}` : null,
          report.isSteamDeck ? 'Steam Deck' : null
        ]
          .filter(Boolean)
          .join(' · ') || '—'}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: report.notes ? '#ccc' : '#666',
          lineHeight: '1.4',
          fontStyle: 'italic'
        }}
      >
        {report.notes
          ? report.notes.length > 200
            ? report.notes.slice(0, 200) + '…'
            : report.notes
          : 'No remarks shared'}
      </div>
    </div>
  )
}

function ratioColor(ratio: number): string {
  if (ratio >= 0.75) return '#4ade80'
  if (ratio >= 0.5) return '#facc15'
  return '#f87171'
}

function isCurrent(version: string): boolean {
  return (
    version === `Proton ${CURRENT_PROTON_MAJOR}` ||
    version === 'Proton Official'
  )
}

function copyToClipboard(text: string): void {
  try {
    const input = document.createElement('input')
    input.value = text
    input.style.position = 'absolute'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    input.focus()
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  } catch {
    try {
      navigator.clipboard.writeText(text)
    } catch {
      /* clipboard unavailable */
    }
  }
}

const SettingRow: FC<{ opt: LaunchOptionStat; appId: string }> = ({
  opt,
  appId
}) => {
  if (!opt?.option || typeof opt.value !== 'string') return null
  const count = typeof opt.count === 'number' ? opt.count : 0
  const total =
    typeof opt.total_with_options === 'number' ? opt.total_with_options : 0
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const text = `${opt.option}=${opt.value}`
  const [copied, setCopied] = useState(false)
  const [applyState, setApplyState] = useState<'idle' | 'conflict' | 'applied'>(
    'idle'
  )
  const [currentOptions, setCurrentOptions] = useState('')

  const handleApply = async () => {
    try {
      const numericId = parseInt(appId, 10)
      if (isNaN(numericId)) return
      const current = await getCurrentLaunchOptions(numericId)
      if (!current.trim()) {
        setLaunchOptions(numericId, text)
        setApplyState('applied')
        setTimeout(() => setApplyState('idle'), 2000)
      } else {
        setCurrentOptions(current)
        setApplyState('conflict')
      }
    } catch {
      setApplyState('idle')
    }
  }

  const resolveConflict = (mode: 'append' | 'replace') => {
    try {
      const numericId = parseInt(appId, 10)
      if (isNaN(numericId)) return
      const merged = buildMergedOptions(currentOptions, text, mode)
      setLaunchOptions(numericId, merged)
      setApplyState('applied')
      setTimeout(() => setApplyState('idle'), 2000)
    } catch {
      setApplyState('idle')
    }
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '6px',
        padding: '8px 12px',
        marginBottom: '6px',
        borderLeft: '3px solid rgba(255,255,255,0.12)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2px'
        }}
      >
        <span
          style={{
            fontWeight: 'bold',
            fontSize: '12px',
            color: '#e0e0e0',
            fontFamily: 'monospace',
            flex: 1
          }}
        >
          {text}
        </span>
        <Focusable
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            color: applyState === 'applied' ? '#4ade80' : '#7dd3fc',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '4px',
            marginLeft: '8px',
            whiteSpace: 'nowrap',
            outline: 'none',
            border: 'none'
          }}
          onClick={handleApply}
          onActivate={handleApply}
          //@ts-ignore
          focusClassName=""
        >
          {applyState === 'applied' ? '✓ Applied' : 'Apply'}
        </Focusable>
        <Focusable
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            color: copied ? '#4ade80' : '#aaa',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '4px',
            marginLeft: '4px',
            whiteSpace: 'nowrap',
            outline: 'none',
            border: 'none'
          }}
          onClick={() => {
            copyToClipboard(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          onActivate={() => {
            copyToClipboard(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          //@ts-ignore
          focusClassName=""
        >
          {copied ? '✓' : 'Copy'}
        </Focusable>
      </div>
      {applyState === 'conflict' && (
        <div
          style={{
            marginTop: '6px',
            padding: '6px 8px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '4px',
            fontSize: '10px'
          }}
        >
          <div style={{ color: '#facc15', marginBottom: '4px' }}>
            Game already has launch options:
          </div>
          <div
            style={{
              color: '#aaa',
              fontFamily: 'monospace',
              marginBottom: '6px',
              wordBreak: 'break-all'
            }}
          >
            {currentOptions}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Focusable
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                color: '#4ade80',
                cursor: 'pointer',
                background: 'rgba(74,222,128,0.1)',
                borderRadius: '3px',
                outline: 'none',
                border: 'none'
              }}
              onClick={() => resolveConflict('append')}
              onActivate={() => resolveConflict('append')}
              //@ts-ignore
              focusClassName=""
            >
              Add to existing
            </Focusable>
            <Focusable
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                color: '#f87171',
                cursor: 'pointer',
                background: 'rgba(248,113,113,0.1)',
                borderRadius: '3px',
                outline: 'none',
                border: 'none'
              }}
              onClick={() => resolveConflict('replace')}
              onActivate={() => resolveConflict('replace')}
              //@ts-ignore
              focusClassName=""
            >
              Replace all
            </Focusable>
            <Focusable
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                color: '#aaa',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '3px',
                outline: 'none',
                border: 'none'
              }}
              onClick={() => setApplyState('idle')}
              onActivate={() => setApplyState('idle')}
              //@ts-ignore
              focusClassName=""
            >
              Cancel
            </Focusable>
          </div>
        </div>
      )}
      <div style={{ fontSize: '10px', color: '#666' }}>
        {count} report{count !== 1 ? 's' : ''} ({pct}%)
      </div>
    </div>
  )
}

const NON_APPLICABLE_VERSIONS = ['other', 'unknown']

const VersionRow: FC<{ stat: GwVersionStat; appId: string }> = ({
  stat,
  appId
}) => {
  if (!stat?.version) return null
  const current = isCurrent(stat.version)
  const canApply =
    typeof stat.version === 'string' &&
    !NON_APPLICABLE_VERSIONS.includes(stat.version.toLowerCase().trim())
  const ratio = Number.isFinite(stat.positive_ratio) ? stat.positive_ratio : 0
  const color = ratioColor(ratio)
  const pct = Math.round(ratio * 100)
  const barWidth = `${Math.min(100, Math.max(0, pct))}%`
  const ts =
    typeof stat.latest_timestamp === 'number' ? stat.latest_timestamp : 0
  const age = ts > 0 ? Math.round((Date.now() / 1000 - ts) / 86400) : -1
  const [applyState, setApplyState] = useState<
    'idle' | 'applied' | 'not_found' | 'confirm_downgrade'
  >('idle')
  const [pendingTool, setPendingTool] = useState<{
    toolName: string
    displayName: string
  } | null>(null)

  const handleApplyVersion = async () => {
    try {
      const numericId = parseInt(appId, 10)
      if (isNaN(numericId)) return
      const tools = await getInstalledCompatTools()
      const match = findMatchingTool(stat.version, tools)
      if (!match) {
        setApplyState('not_found')
        setTimeout(() => setApplyState('idle'), 5000)
        return
      }
      const currentTool = await getCurrentCompatTool(numericId)
      if (currentTool && isDowngrade(currentTool, match.displayName)) {
        setPendingTool(match)
        setApplyState('confirm_downgrade')
        return
      }
      const success = applyCompatTool(numericId, match.toolName)
      if (success) {
        setApplyState('applied')
        setTimeout(() => setApplyState('idle'), 2000)
      }
    } catch {
      setApplyState('idle')
    }
  }

  const confirmDowngrade = () => {
    if (!pendingTool) return
    const numericId = parseInt(appId, 10)
    if (isNaN(numericId)) return
    const success = applyCompatTool(numericId, pendingTool.toolName)
    if (success) {
      setApplyState('applied')
      setTimeout(() => setApplyState('idle'), 2000)
    } else {
      setApplyState('idle')
    }
    setPendingTool(null)
  }

  return (
    <div
      style={{
        background: current
          ? 'rgba(122,179,240,0.10)'
          : 'rgba(255,255,255,0.04)',
        borderRadius: '6px',
        padding: '8px 12px',
        marginBottom: '6px',
        borderLeft: current
          ? '3px solid #7ab3f0'
          : '3px solid rgba(255,255,255,0.12)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px'
        }}
      >
        <span
          style={{
            fontWeight: 'bold',
            fontSize: '13px',
            color: current ? '#7ab3f0' : '#e0e0e0',
            flex: 1
          }}
        >
          {stat.version}
          {current && (
            <span
              style={{
                fontSize: '10px',
                color: '#7ab3f0',
                marginLeft: '6px',
                fontWeight: 'normal'
              }}
            >
              ★ Steam Deck default
            </span>
          )}
        </span>
        {canApply && applyState === 'confirm_downgrade' ? (
          <>
            <span
              style={{
                fontSize: '9px',
                color: '#facc15',
                marginLeft: '6px'
              }}
            >
              Older version — may break game
            </span>
            <Focusable
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                color: '#f87171',
                cursor: 'pointer',
                background: 'rgba(248,113,113,0.15)',
                borderRadius: '4px',
                marginLeft: '6px',
                whiteSpace: 'nowrap',
                outline: 'none',
                border: 'none'
              }}
              onClick={confirmDowngrade}
              onActivate={confirmDowngrade}
              //@ts-ignore
              focusClassName=""
            >
              Downgrade anyway
            </Focusable>
            <Focusable
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                color: '#aaa',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px',
                marginLeft: '4px',
                whiteSpace: 'nowrap',
                outline: 'none',
                border: 'none'
              }}
              onClick={() => setApplyState('idle')}
              onActivate={() => setApplyState('idle')}
              //@ts-ignore
              focusClassName=""
            >
              Cancel
            </Focusable>
          </>
        ) : canApply ? (
          <Focusable
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              color:
                applyState === 'applied'
                  ? '#4ade80'
                  : applyState === 'not_found'
                    ? '#f87171'
                    : '#7dd3fc',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '4px',
              marginLeft: '6px',
              whiteSpace: 'nowrap',
              outline: 'none',
              border: 'none'
            }}
            onClick={handleApplyVersion}
            onActivate={handleApplyVersion}
            //@ts-ignore
            focusClassName=""
          >
            {applyState === 'applied'
              ? '✓ Set'
              : applyState === 'not_found'
                ? 'Not installed'
                : 'Use'}
          </Focusable>
        ) : null}
        <span style={{ color: '#aaa', fontSize: '11px', marginLeft: '6px' }}>
          {stat.total_reports} report{stat.total_reports !== 1 ? 's' : ''}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <div
          style={{
            flex: 1,
            height: '6px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '3px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: barWidth,
              height: '100%',
              background: color,
              borderRadius: '3px',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
        <span style={{ fontSize: '11px', color, minWidth: '32px' }}>
          {pct}%
        </span>
      </div>

      <div
        style={{
          fontSize: '10px',
          color: '#666',
          marginTop: '2px'
        }}
      >
        Latest: {age < 0 ? '—' : age === 0 ? 'today' : `${age}d ago`}
      </div>
      {applyState === 'not_found' && lastDebugInfo && (
        <div
          style={{
            fontSize: '9px',
            color: '#f87171',
            marginTop: '2px',
            wordBreak: 'break-all'
          }}
        >
          Debug: {lastDebugInfo}
        </div>
      )}
    </div>
  )
}

export default function AnalysisModal({
  analysis,
  appId,
  closeModal
}: AnalysisModalProps) {
  const t = useTranslations()
  const confidence = {
    score: analysis.confidence?.score ?? 0,
    level: analysis.confidence?.level ?? 'none',
    factors: Array.isArray(analysis.confidence?.factors)
      ? analysis.confidence.factors
      : []
  }
  const freshness = {
    latest_report_age: analysis.freshness?.latest_report_age ?? 0,
    label: analysis.freshness?.label ?? 'unknown',
    is_stale: analysis.freshness?.is_stale ?? true
  }
  const trend = {
    direction: analysis.trend?.direction ?? 'unknown',
    recent_positive_ratio: analysis.trend?.recent_positive_ratio,
    older_positive_ratio: analysis.trend?.older_positive_ratio
  }
  const stats = {
    total_reports: analysis.stats?.total_reports ?? 0,
    recent_reports: analysis.stats?.recent_reports ?? 0
  }
  const working_status = analysis.working_status
  const [gameName, setGameName] = useState<string>('—')
  const [activeTab, setActiveTab] = useState<AnalysisTab>('details')
  const [history, setHistory] = useState<ReportHistory | undefined>()
  const [historyLoading, setHistoryLoading] = useState(false)
  const [versionsData, setVersionsData] = useState<
    ProtonVersionsResponse | undefined
  >()
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [settingsData, setSettingsData] = useState<
    SettingsTipsResponse | undefined
  >()
  const [settingsLoading, setSettingsLoading] = useState(false)
  const reportAppIdentityRef = useRef({ appId, generation: 0 })
  if (reportAppIdentityRef.current.appId !== appId) {
    reportAppIdentityRef.current = {
      appId,
      generation: reportAppIdentityRef.current.generation + 1
    }
  }
  const reportAppGeneration = reportAppIdentityRef.current.generation
  const [reportSelection, setReportSelection] = useState<{
    appId: string
    appGeneration: number
    device: ReportDevice
  }>({
    appId,
    appGeneration: reportAppGeneration,
    device: 'steam-deck'
  })
  const reportDevice: ReportDevice =
    reportSelection.appId === appId &&
    reportSelection.appGeneration === reportAppGeneration
      ? reportSelection.device
      : 'steam-deck'
  const currentReportScope = reportScope(appId, reportDevice)
  const [reportsView, setReportsView] = useState<ReportsViewState>(() =>
    emptyReportsView(appId, 'steam-deck')
  )
  const reportsViewRef = useRef(reportsView)
  const appIdRef = useRef(appId)
  const reportDeviceRef = useRef<ReportDevice>(reportDevice)
  const activeTabRef = useRef<AnalysisTab>(activeTab)
  const reportGenerationRef = useRef(0)
  const activeReportRequestRef = useRef<ActiveReportRequest | null>(null)
  const modalClosedRef = useRef(false)
  const reportActivationPendingRef = useRef(false)

  reportsViewRef.current = reportsView
  activeTabRef.current = activeTab
  if (appIdRef.current !== appId) {
    reportGenerationRef.current += 1
    activeReportRequestRef.current = null
    appIdRef.current = appId
    reportDeviceRef.current = 'steam-deck'
    reportActivationPendingRef.current = false
  } else {
    reportDeviceRef.current = reportDevice
  }

  function replaceReportsView(next: ReportsViewState): void {
    reportsViewRef.current = next
    setReportsView(next)
  }

  function updateReportsView(
    update: (current: ReportsViewState) => ReportsViewState
  ): void {
    const current = reportsViewRef.current
    const next = update(current)
    if (next === current) return
    replaceReportsView(next)
  }

  function invalidateReportRequest(clearLoading: boolean): void {
    reportGenerationRef.current += 1
    activeReportRequestRef.current = null
    if (!clearLoading || reportsViewRef.current.loadingPage === undefined) {
      return
    }
    updateReportsView((current) => ({
      ...current,
      loadingPage: undefined
    }))
  }

  function startReportRequest(page: number, dataset?: ReportDataset): void {
    const requestAppId = appIdRef.current
    const requestDevice = reportDeviceRef.current
    const scope = reportScope(requestAppId, requestDevice)
    const current = reportsViewRef.current

    if (
      modalClosedRef.current ||
      reportLifetime.signal.aborted ||
      activeTabRef.current !== 'reports' ||
      current.scope !== scope ||
      activeReportRequestRef.current !== null ||
      (page > 1 &&
        (!current.loaded || !dataset || !sameDataset(current.dataset, dataset)))
    ) {
      return
    }

    const token = reportGenerationRef.current + 1
    reportGenerationRef.current = token
    activeReportRequestRef.current = { token, scope, page, dataset }
    updateReportsView((view) =>
      view.scope === scope
        ? {
            ...view,
            loadingPage: page,
            errorPage: undefined
          }
        : view
    )

    const isCurrent = (): boolean => {
      const activeRequest = activeReportRequestRef.current
      return (
        !modalClosedRef.current &&
        !reportLifetime.signal.aborted &&
        activeTabRef.current === 'reports' &&
        appIdRef.current === requestAppId &&
        reportDeviceRef.current === requestDevice &&
        reportGenerationRef.current === token &&
        activeRequest !== null &&
        activeRequest.token === token &&
        activeRequest.scope === scope &&
        activeRequest.page === page &&
        activeRequest.dataset === dataset
      )
    }

    const fail = (): void => {
      if (!isCurrent()) return
      activeReportRequestRef.current = null
      updateReportsView((view) =>
        view.scope === scope
          ? {
              ...view,
              loadingPage: undefined,
              errorPage: page
            }
          : view
      )
    }

    const request: ReportRequest = {
      appId: requestAppId,
      device: requestDevice,
      page,
      dataset,
      isCurrent
    }

    let pending: Promise<ReportPage>
    try {
      pending = getReportPage(request)
    } catch {
      fail()
      return
    }

    pending.then(
      (nextPage) => {
        if (!isCurrent()) return

        const recoveredFirstPage =
          page > 1 &&
          nextPage.page === 1 &&
          !sameDataset(dataset, nextPage.dataset)
        if (
          nextPage.appId !== requestAppId ||
          nextPage.device !== requestDevice ||
          (nextPage.page !== page && !recoveredFirstPage) ||
          (nextPage.page > 1 && !sameDataset(dataset, nextPage.dataset))
        ) {
          fail()
          return
        }

        const view = reportsViewRef.current
        if (view.scope !== scope) return

        let next: ReportsViewState
        if (nextPage.page === 1) {
          next = {
            scope,
            loaded: true,
            dataset: nextPage.dataset,
            page: nextPage.page,
            perPage: nextPage.perPage,
            total: nextPage.total,
            reports: appendUniqueReports([], nextPage.reports),
            visible: REPORTS_DISPLAY_INCREMENT
          }
        } else {
          if (!view.loaded || !sameDataset(view.dataset, nextPage.dataset)) {
            fail()
            return
          }
          const reports = appendUniqueReports(view.reports, nextPage.reports)
          next = {
            ...view,
            dataset: nextPage.dataset,
            page: nextPage.page,
            perPage: nextPage.perPage,
            total: nextPage.total,
            reports,
            visible: Math.min(
              view.visible + REPORTS_DISPLAY_INCREMENT,
              reports.length
            ),
            loadingPage: undefined,
            errorPage: undefined
          }
        }

        activeReportRequestRef.current = null
        replaceReportsView(next)
      },
      () => fail()
    )
  }

  function selectTab(nextTab: AnalysisTab): void {
    if (activeTabRef.current === nextTab) return
    if (activeTabRef.current === 'reports') {
      invalidateReportRequest(true)
    }
    activeTabRef.current = nextTab
    setActiveTab(nextTab)
  }

  function selectReportDevice(device: ReportDevice): void {
    if (appIdRef.current === appId && reportDeviceRef.current === device) {
      return
    }
    invalidateReportRequest(false)
    reportDeviceRef.current = device
    const next = emptyReportsView(appId, device)
    replaceReportsView(next)
    setReportSelection({
      appId,
      appGeneration: reportAppGeneration,
      device
    })
    reportActivationPendingRef.current = false
  }

  function activateReportControl(action: () => void): void {
    if (reportActivationPendingRef.current) return
    reportActivationPendingRef.current = true
    queueMicrotask(() => {
      reportActivationPendingRef.current = false
    })
    action()
  }

  function showMoreReports(): void {
    const view = reportsViewRef.current
    if (
      view.scope !== reportScope(appIdRef.current, reportDeviceRef.current) ||
      !view.loaded ||
      view.loadingPage !== undefined ||
      view.errorPage !== undefined
    ) {
      return
    }
    if (view.visible < view.reports.length) {
      updateReportsView((current) => ({
        ...current,
        visible: Math.min(
          current.visible + REPORTS_DISPLAY_INCREMENT,
          current.reports.length
        )
      }))
      return
    }
    if (
      view.dataset &&
      view.perPage > 0 &&
      view.page * view.perPage < view.total
    ) {
      startReportRequest(view.page + 1, view.dataset)
    }
  }

  function retryReports(): void {
    const view = reportsViewRef.current
    if (
      view.errorPage === undefined ||
      view.loadingPage !== undefined ||
      (view.errorPage > 1 && !view.dataset)
    ) {
      return
    }
    startReportRequest(
      view.errorPage,
      view.errorPage > 1 ? view.dataset : undefined
    )
  }

  function closeAnalysisModal(): void {
    if (modalClosedRef.current) return
    modalClosedRef.current = true
    invalidateReportRequest(false)
    closeModal?.()
  }

  useEffect(() => {
    try {
      const overview = (window as any).appStore?.GetAppOverviewByAppID?.(
        parseInt(appId)
      )
      if (overview?.display_name) setGameName(overview.display_name)
    } catch {
      /* ignore */
    }
  }, [appId])
  useEffect(() => {
    setReportSelection((current) =>
      current.appId === appId && current.appGeneration === reportAppGeneration
        ? current
        : {
            appId,
            appGeneration: reportAppGeneration,
            device: 'steam-deck'
          }
    )
  }, [appId, reportAppGeneration])

  useEffect(
    () => () => {
      modalClosedRef.current = true
      reportGenerationRef.current += 1
      activeReportRequestRef.current = null
    },
    []
  )

  useEffect(() => {
    if (activeTab === 'reports' && !history && !historyLoading) {
      setHistoryLoading(true)
      getReportHistory(appId)
        .then((data) => {
          setHistory(data)
          setHistoryLoading(false)
        })
        .catch(() => {
          setHistoryLoading(false)
        })
    }
    if (activeTab === 'versions' && !versionsData && !versionsLoading) {
      setVersionsLoading(true)
      getCachedVersions(appId)
        .then((cached) => {
          if (cached?.versions?.length) {
            setVersionsData(cached)
            setVersionsLoading(false)
            return null
          }
          return getProtonVersions(appId)
        })
        .then((fresh) => {
          if (fresh === null) return
          if (fresh?.versions?.length) {
            setCachedVersions(appId, fresh)
          }
          setVersionsData(fresh ?? undefined)
          setVersionsLoading(false)
        })
        .catch(() => {
          setVersionsLoading(false)
        })
    }
    if (activeTab === 'settings' && !settingsData && !settingsLoading) {
      setSettingsLoading(true)
      getSettingsTips(appId)
        .then((data) => {
          setSettingsData(data ?? undefined)
          setSettingsLoading(false)
        })
        .catch(() => {
          setSettingsLoading(false)
        })
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'reports') return

    const scope = reportScope(appId, reportDevice)
    if (reportsViewRef.current.scope !== scope) {
      replaceReportsView(emptyReportsView(appId, reportDevice))
    }
    const view = reportsViewRef.current
    if (
      !view.loaded &&
      view.loadingPage === undefined &&
      view.errorPage === undefined
    ) {
      startReportRequest(1)
    }

    return () => invalidateReportRequest(false)
  }, [activeTab, appId, reportDevice])

  const trendIcon = TREND_ICONS[trend.direction] ?? '❓'
  const workingIcon = working_status
    ? (WORKING_STATUS_ICONS[working_status.status] ?? '❓')
    : '❓'

  const rows: Array<{ label: string; value: ReactNode; sub?: boolean }> = [
    { label: 'Game name', value: gameName },
    { label: 'Game App ID', value: appId },
    {
      label: 'Working status',
      value: working_status?.status
        ? `${workingIcon} ${working_status.status.replace('_', ' ')} (${working_status.confidence ?? 'unknown'} certainty)`
        : '❓ Unknown'
    },
    {
      label: '— Recently broken',
      value: working_status
        ? working_status.recently_broken
          ? 'Yes'
          : 'No'
        : '—',
      sub: true
    },
    {
      label: '— Timeframe',
      value:
        working_status?.timeframe_days != null
          ? `Last ${working_status.timeframe_days} days`
          : '—',
      sub: true
    },
    {
      label: '— Last positive report',
      value:
        working_status?.last_positive_report_age != null
          ? `${working_status.last_positive_report_age} days ago`
          : '—',
      sub: true
    },
    {
      label: 'Confidence',
      value: `${confidence.level} (${confidence.score}/100)`
    },
    {
      label: 'Confidence factors',
      value: confidence.factors.length > 0 ? confidence.factors.join(', ') : '—'
    },
    {
      label: 'Trend',
      value:
        trend.direction === 'unknown'
          ? '❓ Not enough recent data'
          : `${trendIcon} ${trend.direction.charAt(0).toUpperCase() + trend.direction.slice(1)}`
    },
    {
      label: '— Recent positive ratio',
      value: formatPercent(trend.recent_positive_ratio),
      sub: true
    },
    {
      label: '— Older positive ratio',
      value: formatPercent(trend.older_positive_ratio),
      sub: true
    },
    {
      label: 'Freshness',
      value: `${freshness.label} (${freshness.latest_report_age} days ago)`
    },
    {
      label: 'Stale',
      value: freshness.is_stale ? 'Yes' : 'No'
    },
    {
      label: 'Total reports',
      value: stats.total_reports
    },
    {
      label: 'Recent reports',
      value: stats.recent_reports
    }
  ]
  const currentReportsView =
    reportsView.scope === currentReportScope
      ? reportsView
      : emptyReportsView(appId, reportDevice)
  const visibleReportCount = Math.min(
    currentReportsView.visible,
    currentReportsView.reports.length
  )
  const hasNextReportPage =
    currentReportsView.loaded &&
    currentReportsView.perPage > 0 &&
    currentReportsView.page * currentReportsView.perPage <
      currentReportsView.total
  const canShowMoreReports =
    currentReportsView.loaded &&
    (visibleReportCount < currentReportsView.reports.length ||
      hasNextReportPage)
  const reportsRemaining = Math.max(
    currentReportsView.total - visibleReportCount,
    0
  )
  const selectedReportOption =
    REPORT_DEVICE_OPTIONS.find((option) => option.device === reportDevice)
      ?.data ?? 0

  return (
    <ConfirmModal
      strTitle=" "
      strOKButtonText="Close"
      bAlertDialog
      onOK={closeAnalysisModal}
      onCancel={closeAnalysisModal}
      bHideCloseIcon={false}
    >
      <style>
        {`
          .DialogBody *:focus,
          .DialogBody *:focus-visible,
          .ModalPosition *:focus,
          .ModalPosition *:focus-visible,
          .ConfirmDialog *:focus,
          .ConfirmDialog *:focus-visible {
            outline: none !important;
            box-shadow: none !important;
            border-color: transparent !important;
          }
        `}
      </style>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginTop: '-32px',
          marginBottom: '8px'
        }}
      >
        <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
          ProtonDB Analysis
        </span>
        <a
          href="https://protondb.schelstraete.org/status"
          style={{
            color: '#7ab3f0',
            fontSize: '11px',
            textDecoration: 'none',
            outline: 'none'
          }}
          tabIndex={-1}
          onClick={() =>
            Navigation.NavigateToExternalWeb(
              'https://protondb.schelstraete.org/status'
            )
          }
        >
          protondb.schelstraete.org
        </a>
      </div>

      <Focusable
        style={{ display: 'flex', marginBottom: '8px' }}
        //@ts-ignore
        flow-children="row"
      >
        <Focusable
          style={tabStyle(activeTab === 'details')}
          onClick={() => selectTab('details')}
          onActivate={() => selectTab('details')}
        >
          Details
        </Focusable>
        <Focusable
          style={tabStyle(activeTab === 'reports')}
          onClick={() => selectTab('reports')}
          onActivate={() => selectTab('reports')}
        >
          Reports
        </Focusable>
        <Focusable
          style={tabStyle(activeTab === 'versions')}
          onClick={() => selectTab('versions')}
          onActivate={() => selectTab('versions')}
        >
          Versions
        </Focusable>
        <Focusable
          style={tabStyle(activeTab === 'settings')}
          onClick={() => selectTab('settings')}
          onActivate={() => selectTab('settings')}
        >
          Settings
        </Focusable>
      </Focusable>

      {activeTab === 'details' && (
        <ScrollPanelGroup>
          <ScrollPanel>
            <Focusable
              style={{ padding: '4px' }}
              //@ts-ignore
              flow-children="column"
            >
              {rows.map((row, i) => (
                <Focusable
                  key={row.label}
                  onFocus={(e: React.FocusEvent) =>
                    (e.target as HTMLElement).scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest'
                    })
                  }
                >
                  <Row
                    label={row.label}
                    value={row.value}
                    even={i % 2 === 0}
                    sub={row.sub}
                  />
                </Focusable>
              ))}
            </Focusable>
          </ScrollPanel>
        </ScrollPanelGroup>
      )}

      {activeTab === 'reports' && (
        <div style={{ padding: '4px' }}>
          <div
            style={{
              color: '#888',
              marginBottom: '8px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '12px', marginBottom: '2px' }}>
              {gameName}
            </div>
            <div style={{ fontSize: '11px' }}>All systems — Last 5 years</div>
          </div>
          {historyLoading ? (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '20px 0'
              }}
            >
              Loading chart...
            </div>
          ) : history ? (
            <div style={{ outline: 'none' }} tabIndex={-1}>
              <ReportChart months={history.months} />
            </div>
          ) : null}

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              marginTop: '12px',
              paddingTop: '8px'
            }}
          />

          <DropdownItem
            label="Individual reports"
            description="Choose which systems to include"
            menuLabel="Report device"
            rgOptions={REPORT_DEVICE_DROPDOWN_OPTIONS}
            selectedOption={selectedReportOption}
            onChange={(selected: { data: number; label: string }) => {
              const option = REPORT_DEVICE_OPTIONS.find(
                (candidate) => candidate.data === selected.data
              )
              if (option) selectReportDevice(option.device)
            }}
          />

          {!currentReportsView.loaded &&
          currentReportsView.errorPage === undefined ? (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              Loading...
            </div>
          ) : !currentReportsView.loaded ? (
            <div
              style={{
                color: '#aaa',
                textAlign: 'center',
                padding: '32px 0'
              }}
            >
              <div style={{ marginBottom: '10px' }}>
                {reportDevice === 'steam-deck'
                  ? 'Unable to load Steam Deck reports'
                  : 'Unable to load reports'}
              </div>
              <Focusable
                style={{
                  display: 'inline-block',
                  padding: '8px 18px',
                  fontSize: '12px',
                  color: '#7ab3f0',
                  cursor: 'pointer',
                  background: 'rgba(122,179,240,0.08)',
                  borderRadius: '6px'
                }}
                onClick={() => activateReportControl(retryReports)}
                onActivate={() => activateReportControl(retryReports)}
              >
                Retry
              </Focusable>
            </div>
          ) : currentReportsView.reports.length > 0 ? (
            <ScrollPanelGroup>
              <ScrollPanel>
                <Focusable
                  style={{ padding: '4px' }}
                  //@ts-ignore
                  flow-children="column"
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#888',
                      marginBottom: '8px',
                      textAlign: 'center'
                    }}
                  >
                    {visibleReportCount} shown ·{' '}
                    {currentReportsView.reports.length} of{' '}
                    {currentReportsView.total} loaded
                  </div>
                  {currentReportsView.reports
                    .slice(0, visibleReportCount)
                    .map((report) => (
                      <Focusable
                        key={report.id}
                        onFocus={(e: React.FocusEvent) =>
                          (e.target as HTMLElement).scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest'
                          })
                        }
                      >
                        <ReportCard report={report} />
                      </Focusable>
                    ))}
                  {currentReportsView.errorPage !== undefined && (
                    <div
                      style={{
                        color: '#aaa',
                        textAlign: 'center',
                        padding: '8px 0'
                      }}
                    >
                      Unable to load more reports
                    </div>
                  )}
                  {(currentReportsView.errorPage !== undefined ||
                    canShowMoreReports) && (
                    <Focusable
                      key="report-pagination"
                      aria-disabled={
                        currentReportsView.loadingPage !== undefined
                      }
                      style={{
                        textAlign: 'center',
                        padding: '10px 0',
                        fontSize: '12px',
                        color:
                          currentReportsView.loadingPage !== undefined
                            ? '#888'
                            : '#7ab3f0',
                        cursor:
                          currentReportsView.loadingPage !== undefined
                            ? 'default'
                            : 'pointer',
                        background: 'rgba(122,179,240,0.08)',
                        borderRadius: '6px',
                        marginTop: '4px'
                      }}
                      onClick={() =>
                        activateReportControl(
                          currentReportsView.errorPage !== undefined
                            ? retryReports
                            : showMoreReports
                        )
                      }
                      onActivate={() =>
                        activateReportControl(
                          currentReportsView.errorPage !== undefined
                            ? retryReports
                            : showMoreReports
                        )
                      }
                    >
                      {currentReportsView.loadingPage !== undefined
                        ? 'Loading more...'
                        : currentReportsView.errorPage !== undefined
                          ? 'Retry'
                          : `Show more (${reportsRemaining} remaining)`}
                    </Focusable>
                  )}
                </Focusable>
              </ScrollPanel>
            </ScrollPanelGroup>
          ) : (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              {reportDevice === 'steam-deck'
                ? 'No Steam Deck reports available'
                : 'No reports available'}
            </div>
          )}
        </div>
      )}

      {activeTab === 'versions' && (
        <div style={{ padding: '4px' }}>
          {versionsLoading ? (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              Loading...
            </div>
          ) : versionsData?.versions?.length ? (
            <ScrollPanelGroup>
              <ScrollPanel>
                <Focusable
                  style={{ padding: '4px' }}
                  //@ts-ignore
                  flow-children="column"
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#888',
                      marginBottom: '8px',
                      textAlign: 'center'
                    }}
                  >
                    {versionsData.total_reports} reports across all versions
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      color: '#666',
                      padding: '0 12px 4px',
                      marginBottom: '2px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    <span>Version</span>
                    <span>% positive ratings</span>
                  </div>
                  {versionsData.versions.map((stat) => (
                    <Focusable
                      key={stat.version}
                      onFocus={(e: React.FocusEvent) =>
                        (e.target as HTMLElement).scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest'
                        })
                      }
                    >
                      <VersionRow stat={stat} appId={appId} />
                    </Focusable>
                  ))}
                  {!versionsData.versions.some((s) => isCurrent(s.version)) && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#facc15',
                        textAlign: 'center',
                        padding: '8px 0',
                        marginTop: '4px'
                      }}
                    >
                      No reports found for Proton {CURRENT_PROTON_MAJOR} (Steam
                      Deck default)
                    </div>
                  )}
                </Focusable>
              </ScrollPanel>
            </ScrollPanelGroup>
          ) : (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              No report data available
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div style={{ padding: '4px' }}>
          {settingsLoading ? (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              Loading...
            </div>
          ) : settingsData?.launch_options?.length ? (
            <ScrollPanelGroup>
              <ScrollPanel>
                <Focusable
                  style={{ padding: '4px' }}
                  //@ts-ignore
                  flow-children="column"
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#888',
                      marginBottom: '8px',
                      textAlign: 'center'
                    }}
                  >
                    {t('settingsTabCount')
                      .replace(
                        '{with}',
                        String(settingsData.reports_with_settings ?? 0)
                      )
                      .replace(
                        '{total}',
                        String(settingsData.total_reports ?? 0)
                      )}
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#666',
                      marginBottom: '4px',
                      textAlign: 'center',
                      lineHeight: '1.4'
                    }}
                  >
                    {t('settingsTabHint')}
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#555',
                      marginBottom: '8px',
                      textAlign: 'center',
                      fontFamily: 'monospace'
                    }}
                  >
                    {t('settingsTabExample')}
                  </div>
                  {settingsData.launch_options.map((opt, i) => (
                    <Focusable
                      key={`${opt.option}-${opt.value}-${i}`}
                      onFocus={(e: React.FocusEvent) =>
                        (e.target as HTMLElement).scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest'
                        })
                      }
                    >
                      <SettingRow opt={opt} appId={appId} />
                    </Focusable>
                  ))}
                </Focusable>
              </ScrollPanel>
            </ScrollPanelGroup>
          ) : (
            <div
              style={{
                color: '#888',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              {t('settingsTabEmpty')}
            </div>
          )}
        </div>
      )}
    </ConfirmModal>
  )
}
