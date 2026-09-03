import { fetchNoCors } from '@decky/api'
import { normaliseMatchTitle, nonPrimaryMarkers } from './matchTitle'

const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/'
const FETCH_TIMEOUT_MS = 2000

type StoreSearchItem = {
  type?: string
  name?: string
  id?: number
}

async function fetchWithTimeout(
  fetchPromise: Promise<Response>,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  })
  return Promise.race([fetchPromise, timeoutPromise])
}

/**
 * Resolve a non-Steam shortcut name to a Steam app ID.
 *
 * Uses the store search endpoint rather than the community autocomplete: it
 * returns full store titles ("Assassin's Creed™: Director's Cut Edition")
 * where the autocomplete only returns short ones ("Assassin's Creed"), so
 * more shortcuts normalise onto a candidate. Results are pinned to English so
 * the candidate names match what normaliseMatchTitle expects.
 */
export async function findSteamAppIdByName(
  gameName: string
): Promise<string | null> {
  const query = normaliseMatchTitle(gameName)
  if (!query) return null
  const queryMarkers = new Set(nonPrimaryMarkers(gameName))

  try {
    const params = new URLSearchParams({
      term: gameName,
      cc: 'US',
      l: 'english'
    })
    const res = await fetchWithTimeout(
      fetchNoCors(`${SEARCH_URL}?${params.toString()}`, { method: 'GET' })
    )

    if (res.status === 200) {
      const items = (await res.json())?.items
      if (!Array.isArray(items)) return null
      const match = (items as StoreSearchItem[]).find(
        (item) =>
          item?.type === 'app' &&
          item?.name &&
          normaliseMatchTitle(item.name) === query &&
          nonPrimaryMarkers(item.name).every((marker) =>
            queryMarkers.has(marker)
          )
      )
      return typeof match?.id === 'number' ? String(match.id) : null
    }
  } catch (error) {
    console.error(error)
  }
  return null
}
