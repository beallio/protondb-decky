import { useParams as deckyUseParams, findModuleExport } from '@decky/ui'

function findUseParams(): <T>() => T {
  if (typeof deckyUseParams === 'function') {
    return deckyUseParams
  }

  const found = findModuleExport(
    (e: unknown) =>
      typeof e === 'function' &&
      e.toString().length < 200 &&
      /\.params:\{\}/.test(e.toString())
  ) as (<T>() => T) | undefined

  if (typeof found === 'function') {
    return found
  }

  return <T>() => {
    const match = window.location.pathname.match(/\/app\/(\d+)/)
    return (match ? { appid: match[1] } : {}) as T
  }
}

export const useParams = findUseParams()
