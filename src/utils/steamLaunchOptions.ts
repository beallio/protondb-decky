export function getCurrentLaunchOptions(appId: number): Promise<string> {
  return new Promise((resolve) => {
    const steamApps = (globalThis as any).SteamClient?.Apps
    if (!steamApps?.RegisterForAppDetails) {
      resolve('')
      return
    }

    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        unregister()
        resolve('')
      }
    }, 1500)

    let unregister = () => {}
    const registration = steamApps.RegisterForAppDetails(
      appId,
      (details: any) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          unregister()
          resolve(
            typeof details?.strLaunchOptions === 'string'
              ? details.strLaunchOptions
              : ''
          )
        }
      }
    )
    unregister = registration?.unregister ?? (() => {})
  })
}

export function setLaunchOptions(appId: number, options: string): void {
  try {
    const steamApps = (globalThis as any).SteamClient?.Apps
    if (steamApps?.SetAppLaunchOptions) {
      steamApps.SetAppLaunchOptions(appId, options)
    }
  } catch {
    /* prevent crash if Steam API throws */
  }
}

export function buildMergedOptions(
  current: string,
  newOption: string,
  mode: 'append' | 'replace'
): string {
  if (mode === 'replace') return newOption
  if (!current.trim()) return newOption
  if (current.includes(newOption)) return current
  return `${current} ${newOption}`
}
