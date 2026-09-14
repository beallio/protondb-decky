export type ReportDevice = 'steam-deck' | 'all-devices'

export interface ReportDataset {
  reports: number
  timestamp: number
}

export interface CommunityReport {
  id: string
  timestamp: number
  outcome: 'working' | 'issues' | 'unknown'
  notes?: string
  protonVersion?: string
  os?: string
  isSteamDeck: boolean
}

export interface ReportPage {
  appId: string
  device: ReportDevice
  dataset: ReportDataset
  page: number
  perPage: number
  total: number
  reports: CommunityReport[]
}

export interface ReportRequest {
  appId: string
  device: ReportDevice
  page: number
  dataset?: ReportDataset
  isCurrent: () => boolean
}
