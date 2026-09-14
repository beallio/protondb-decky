# ProtonDB Badges - beallio edit

[![Latest Release](https://img.shields.io/github/v/release/beallio/protondb-decky?label=version)](https://github.com/beallio/protondb-decky/releases)
[![License](https://img.shields.io/github/license/beallio/protondb-decky)](LICENSE)
[![Decky Loader](https://img.shields.io/badge/Decky-Loader-blue)](https://github.com/SteamDeckHomebrew/decky-loader)

See **ProtonDB compatibility ratings** on your game pages and Steam Store pages. Open **compatibility analysis** to read community reports, compare Proton versions, and find launch options. Individual reports show **Steam Deck** results by default, with **All systems** available as an alternative.

Status icons on Home and Library game covers show whether a game is reported to work. You can also submit a ProtonDB report directly from Game Mode.

> ### 🍴 This is a fork
>
> This repository is a fork of [**bschelst/protondb-decky**](https://github.com/bschelst/protondb-decky).
> It includes fixes and features that are not yet in upstream. Some have been proposed
> upstream; the table below shows their status. For the official plugin, use the upstream
> repository or the Decky Store.
>
> Releases here are versioned `<upstream version>+beallio.N` — for example
> `v1.3.3+beallio.1` is the fork's first build on top of upstream v1.3.3.
> Fork releases are published on the `fork-main` branch; `main` mirrors upstream unchanged.

### Changes in this fork awaiting upstream integration

**First fork release** identifies the first published version with each change.
Later fork releases also include these changes.

| Change | First fork release | Upstream PR | Status |
|---|---|---|---|
| **Focus-only library icons** — show cover icons only while a game is focused or hovered, instead of on every cover. | `1.3.3+beallio.1` | [bschelst#8](https://github.com/bschelst/protondb-decky/pull/8) | Open |
| **Version display fix** — the plugin's About section reads the installed version from the package, so it no longer shows an old number. | `1.3.3+beallio.1` | [bschelst#6](https://github.com/bschelst/protondb-decky/pull/6) | Open |
| **Non-Steam shortcut matching** — improved title matching through Steam Store search finds more games, including *Assassin's Creed: Director's Cut* and *Prince of Persia: The Lost Crown*. Demo and DLC entries are rejected. | `1.3.3+beallio.2` | — | Not submitted |
| **Game-page rating fix** — game pages no longer show a temporary `pending` rating from cover-icon lookups. | `1.3.3+beallio.2` | — | Not submitted |
| **Reused game-cover fix** — an icon no longer carries over to a different game when Steam reuses a cover in the grid. | `1.3.3+beallio.2` | — | Not submitted |
| **ProtonDB fallback lookup** — when Steam returns no matching game, search the SteamDB title index used by ProtonDB. This can find some delisted non-Steam games, such as *TRANSFORMERS: Devastation*. | `1.3.3+beallio.3` | — | Not submitted |
| **Home and Library icon update** — cover icons align with Steam's own icons, use its focus fade, and update without leaving the page when enabled or disabled. | `1.3.3+beallio.3` | — | Not submitted |
| **Complete installation package** — release archives include the settings file required for the plugin to start. | `1.3.3+beallio.3` | — | Not submitted |
| **Steam Deck report filter** — individual reports come directly from ProtonDB and default to Steam Deck. Choose All systems or use Show more to read additional reports. | `1.3.3+beallio.4` | — | Not submitted |

Once a change is merged upstream it is dropped from this table and from the fork's
own patch set at the next rebase onto upstream.

### Installing a fork build

Download `protondb-decky.zip` from the [releases page](https://github.com/beallio/protondb-decky/releases),
then install it through Decky Loader's **Settings → Developer → Install Plugin from ZIP**.
Install the ZIP over your current copy to keep your settings. The fork and the Decky
Store version use the same plugin name, so only one can be installed at a time.

---

![Dead by Daylight - Badge](./assets/20260520220425_1.jpg)

| | |
|:---:|:---:|
| ![Details](./assets/20260520220435_1.jpg) | ![Reports](./assets/20260520220451_1.jpg) |
| Details tab | Reports tab |
| ![Versions](./assets/20260520220504_1.jpg) | ![Settings](./assets/20260520220511_1.jpg) |
| Versions tab | Settings tab |
| ![Library Grid](./assets/20260520220606_1.jpg) | ![Store Page](./assets/20260520220626_1.jpg) |
| Library status icons | Store page overlay |

---

## ⚙️ What it does

ProtonDB Badges retrieves ProtonDB ratings via the ProtonDB API and overlays them as a tappable badge on each game's library page. Tapping the badge opens the corresponding ProtonDB page.

The **Submit** button lets you submit ProtonDB reports directly from Game Mode, without opening a separate browser.
The submit button can be enabled or disabled in the plugin settings.

---

## 🛠️ Features & Options

- **Badge size**: Regular, Small, or Minimalist (icon-only)
- **Badge position**: Multiple positions around the game header. (Hero)
- **Submit button toggle**: Disable report submission if desired.
- **Library badge button toggle**: Disable the badges in library.
- **Store badge button toggle**: Disable the badge in Steam store pages.


---

## 📊 Compatibility Analysis

The analysis button (bar chart icon) next to the ProtonDB badge opens a detailed compatibility breakdown powered by community reports. The button color indicates the current working status:

- **Green** — Game is working based on recent reports
- **Red** — Game is not working or has significant issues
- **Gray** — Not enough data to determine status

> Note: These colors reflect whether the game works *right now*, which is different from the ProtonDB tier (Platinum/Gold/Silver/Bronze/Borked) that rates *how well* it runs.

### Tabs

| Tab | Description |
|-----|-------------|
| **Details** | Working status, confidence score, trend direction, freshness, and warnings |
| **Reports** | A five-year history chart for all systems and individual reports from ProtonDB. **Steam Deck** is selected by default; choose **All systems** to include other devices |
| **Versions** | Proton version breakdown — report counts and success rates per version. The current Steam Deck default is highlighted |
| **Settings** | Launch options extracted from positive community reports. Tap **Copy** to copy an option to clipboard, or press Apply to apply them automatically |

### Reading reports

The **Steam Deck** / **All systems** selector changes only the individual report list.
It does not change the history chart, Versions tab, or Settings tab.

**Show more** displays five more reports and loads another page when needed.
Your selection stays when you switch tabs. Reopening the analysis window or changing
the game resets the selection to **Steam Deck**.

If there are no Steam Deck reports, you can choose **All systems**. The plugin does
not switch automatically. If loading another page fails, the reports already shown
stay visible; use **Retry** to try again.

### Library Status Icons

Small status icons appear on game covers in Home's recent-games row and the Library grid:

- **Green atom** — Game should work on Linux
- **Red atom** — Game is borked or not working
- **Gray atom** — Unknown or insufficient data

Use the plugin settings to show icons on all covers or only on the focused or hovered game. You can place them at the bottom left, top left, or top right. The icons do not change how you select or open a game.

Icons appear when compatibility data is available. Games without cached data may take a few minutes while the plugin fetches data in the background.

### Settings Tips

The Settings tab shows environment variables that other users have successfully used when running the game. Only options from positive reports (Platinum/Gold/Silver) are included, and each option must appear in at least 2 reports.

Example usage:
```
PROTON_ENABLE_NVAPI=1 %command%
```

---

## ⚠️ Limitations

**ProtonDB device registration**  
The first time you want to submit a report on Steam Deck, you will need to open the protondb website in desktop mode in order to register the Steam Deck.
This is a limitation of the protondb website, and this is only a one-time action.

**Steam Store page ProtonDB badges**  
- Currently the badges are visible as an overlay, which doesn't look the same as the badges on the library.
- It's currently not possible to click on the badge using an external controller.
- The Steam Store overlay is supported on Steam Deck only, not on other Linux PCs.

---

## Compatibility & Testing

Tested on:
- **Steam Deck** — Stable release.
- **Lenovo Legion Go S** — Stable release.

---

## 🧩 Requirements

- Steam Deck or Linux PC using Steam Big Picture
- Decky Loader installed


Decky Loader:  
https://github.com/SteamDeckHomebrew/decky-loader

---

## 📦 Installation (Decky Loader)

To install this fork, use its release ZIP. The Decky Store version does not include this fork's changes.

1. Download the **latest `.zip` release**:
   https://github.com/beallio/protondb-decky/releases

2. Open **Game Mode** and launch **Decky Loader**.

3. Enable developer mode in Decky Loader if not enabled yet.

4. Go to **Decky Settings → Developer → Install Plugin from ZIP**.

5. Select the downloaded `protondb-decky.zip`.

6. Restart Steam if the plugin does not appear.

The badges will appear automatically on supported games in your library.

### 🔄 Updating

To update, install the latest ZIP via Decky Loader.  
Existing settings are preserved.
