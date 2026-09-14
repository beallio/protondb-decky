import { useParams as deckyUseParams, findModuleExport } from '@decky/ui'

function urlFallback<T>(): T {
  const match = window.location.pathname.match(/\/app\/(\d+)/)
  return (match ? { appid: match[1] } : {}) as T
}

function findUseParams(): <T>() => T {
  try {
    if (typeof deckyUseParams === 'function') {
      console.info('[ProtonDB] useParams: using @decky/ui export')
      return deckyUseParams
    }

    if (typeof findModuleExport === 'function') {
      const found = findModuleExport((e: unknown) => {
        try {
          return (
            typeof e === 'function' &&
            e.toString().length < 200 &&
            /\.params:\{\}/.test(e.toString())
          )
        } catch {
          return false
        }
      }) as (<T>() => T) | undefined

      if (typeof found === 'function') {
        console.info('[ProtonDB] useParams: found via findModuleExport')
        return found
      }
    }
  } catch (e) {
    console.error('[ProtonDB] useParams: fallback search failed', e)
  }

  console.info('[ProtonDB] useParams: using URL pathname fallback')
  return urlFallback
}

export const useParams = findUseParams()
