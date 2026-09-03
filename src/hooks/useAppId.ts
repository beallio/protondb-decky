import { useEffect, useState } from 'react'
import { appTypes } from '../constants'
import { useParams } from './useParams'
import { findSteamAppIdByName } from '../lib/steamSearch'

const useAppId = () => {
  const [appId, setAppId] = useState<string>()
  const { appid: pathId } = useParams<{ appid: string }>()

  useEffect(() => {
    let ignore = false
    async function getNonSteamAppId(gameName: string | undefined) {
      if (ignore || !gameName) {
        setAppId(undefined)
        return
      }

      setAppId((await findSteamAppIdByName(gameName)) ?? undefined)
    }
    const appDetails = appStore.GetAppOverviewByGameID(parseInt(pathId))
    const isSteamGame = Boolean(
      appTypes[appDetails?.app_type as keyof typeof appTypes]
    )
    if (isSteamGame) {
      setAppId(pathId)
    } else {
      getNonSteamAppId(appDetails?.display_name)
    }
    return () => {
      ignore = true
    }
  }, [])
  return appId
}

export default useAppId
