# ProtonDB Badges 🎮

[![Latest Release](https://img.shields.io/github/v/release/beallio/protondb-decky?label=version)](https://github.com/beallio/protondb-decky/releases)
[![License](https://img.shields.io/github/license/beallio/protondb-decky)](LICENSE)
[![Decky Loader](https://img.shields.io/badge/Decky-Loader-blue)](https://github.com/SteamDeckHomebrew/decky-loader)

Display **tappable ProtonDB badges** on your Steam library and Store pages, with a **submit** button to report directly from Game Mode, a **compatibility analysis** modal (working status, report trends, Proton version breakdown, and recommended launch options), and **status icons** on library game covers. Badges and analysis are also available as an overlay on **Steam Store pages**.

> ### 🍴 This is a fork
>
> This repository is a fork of [**bschelst/protondb-decky**](https://github.com/bschelst/protondb-decky).
> It carries changes that are proposed upstream but not yet merged, so that they can
> be installed before upstream accepts them. For the official plugin, use the upstream
> repository or the Decky store.
>
> Releases here are versioned `<upstream version>+beallio.N` — for example
> `v1.3.3+beallio.1` is the fork's first build on top of upstream v1.3.3.
> Fork releases are published on the `fork-main` branch; `main` mirrors upstream unchanged.

### Changes in this fork awaiting upstream integration

| Change | Upstream PR | Status |
|---|---|---|
| **Focus-only library icons** — new setting to show ProtonDB status icons on library covers only while a game is focused, instead of on every tile. | [bschelst#8](https://github.com/bschelst/protondb-decky/pull/8) | Open |
| **QAM version display fix** — the About section reads the version from the package metadata, so it no longer shows a stale number. | [bschelst#6](https://github.com/bschelst/protondb-decky/pull/6) | Open |
| **Non-Steam shortcut matching** — shortcut names are normalised (articles, edition/remaster wording, region and version tokens) and looked up through the Steam store search endpoint instead of the community autocomplete, so titles like *Assassin's Creed: Director's Cut* and *Prince of Persia: The Lost Crown* get a badge. Demo and DLC entries are rejected. | — | Not submitted |
| **Game-page rating fix** — game pages no longer show a temporary `pending` rating from cover-icon lookups. | — | Not submitted |
| **ProtonDB fallback lookup** — when Steam returns no matching game, search the SteamDB title index used by ProtonDB. This can find some delisted non-Steam games, such as *TRANSFORMERS: Devastation*. | — | Not submitted |
| **Home and Library icon update** — cover icons align with Steam's own icons, use its focus fade, stay correct when Steam reuses a game cover, and update without leaving the page when enabled or disabled. | — | Not submitted |

Once a change is merged upstream it is dropped from this table and from the fork's
own patch set at the next rebase onto upstream.

### Installing a fork build

Download `protondb-decky.zip` from the [releases page](https://github.com/beallio/protondb-decky/releases),
then install it through Decky Loader's **Settings → Developer → Install Plugin from ZIP**.
Uninstall the store version first — both use the same plugin name.

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
| **Reports** | A five-year report history chart for all systems, followed by individual reports fetched directly from ProtonDB. **Steam Deck** is selected each time analysis opens; choose **All systems** to include other devices. **Show more** reveals additional reports and loads the next page when needed. The selector does not change the chart. |
| **Versions** | Proton version breakdown — report counts and success rates per version. The current Steam Deck default is highlighted |
| **Settings** | Launch options extracted from positive community reports. Tap **Copy** to copy an option to clipboard, or press Apply to apply them automatically |

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

- Steam Deck, Steam Machine or Linux PC using Steam Big Picture
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
