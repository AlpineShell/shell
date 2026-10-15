# Settings model: a declarative registry

This is the decision record for `apps/desktop/src/settings/registry.ts`. It covers what the
settings surface contains today, why the model is a registry rather than more hand-written
pages, what the registry deliberately does not cover, and — importantly — what evidence
does and does not exist behind the page order.

## The inventory

Two different kinds of thing live in the settings window, and the distinction drives
everything below.

### A. Scalar settings — a label, a value, a control, a store

| Page | Setting | Stored in |
|---|---|---|
| Ridge | colour override, automatic colour | `electron/modules/topbarColor.js` → `topbar-color.json` |
| Ridge | adapt to apps | `electron/modules/foregroundColor.js` → `foreground-color.json` |
| Ridge | which items are hidden, and the side and place of each one | `electron/modules/topbarLayout.js` → `topbar-layout.json` |
| Ridge | show search button, show media visualizer | `electron/modules/topbarColor.js` → `topbar-color.json` |
| Ridge | time format (12h/24h) | `electron/modules/clockPrefs.js` → `clock-prefs.json` |
| Ridge | show tray, show overflow arrow, show on all monitors | `electron/modules/trayLayout.js` → `tray-layout.json` |
| Ridge | confirm power menu actions | `electron/modules/power.js` → `power-prefs.json` |
| Ridge | days shown (1/2/3), show Google Tasks | `electron/modules/clockPrefs.js` → `clock-prefs.json` |
| Search | Search hotkey, show bookmarks, show browser tabs, maximum results | `electron/modules/launcherHotkey.js` → `launcher-hotkey.json`, `electron/modules/launcherPrefs.js` → `launcher-prefs.json` |
| Window Tiling | enabled, mode, Win+Arrow snapping, drag-to-zone, dynamic layout, split ratios, gap, outer margin, keep-oversized, placement | `electron/modules/tiling.js` → `tiling.json` |
| Battery | force battery saver, automatic, threshold %, dim displays, dim by %, dim external monitors, reduce background polling, throttle processes | `electron/modules/batterySaver.js` + `batterySaverPolicy.js` → `battery-saver-prefs.json` |
| Wallpaper | wallpaper source and selection | `electron/modules/wallpaper.js` → `wallpaper.json` |
| Input and language | default input method | Windows, `HKCU\Control Panel\International\User Profile`, through `electron/modules/keyboardLayout.js` |
| Updates | check for updates | `electron/modules/updater.js` → `update-prefs.json` |
| — (Search only) | volume, mute, emoji, power | live system state, not a prefs file |

### B. Device and app managers — lists with actions

Wi-Fi networks, Bluetooth devices, the Displays canvas, Running apps, Installed apps,
Startup apps, Plugins, Updates, Tray icon ordering, Revert to Windows, and the keyboard
layouts attached to each of your languages. These are not settings. They are lists of things
that exist outside Alpine, with per-item actions (connect, pair, uninstall, apply, revert,
add a layout, drop a layout, move one up the list). A registry cannot own them.

The arrangement of the items on Ridge sits with them. It is the one list here that Alpine owns
rather than Windows, but it has the same shape: per-item actions (move to another side, move
along, hide, bring back) and no single value a row could edit. So it gets its own canvas, and
the registry holds only the entries search needs to reach it.

### The page order this implies

The registry declares 22 pages: the 21 routes `settingsRoutes.tsx` renders, plus one
launcher-only page (below). Ridge added a page and System tray, folded into it, took one away,
so the count did not move. The sidebar has four groups — Home, Personal, Devices, System —
and every page in it is one click away.

The order comes out of the A/B split above, not out of a claim about what people use.

**Group A is what you tune; group B is what you set up.** A scalar setting is a preference
that follows taste and context, and taste changes: the theme changes with the light in the
room, the Ridge colour with the wallpaper, the tiling gap when you get a second monitor,
battery saver when you unplug. A manager is a list of things that exist outside Alpine, and
you touch it when something outside Alpine changes — you bought a monitor, you installed an
app, you want an app gone. That is the difference the inventory makes visible, and step
count should follow it.

Measured against that, the old layout was inverted. All seven tunable pages sat two clicks
deep behind a Personalization hub that existed only to list them, and behind a System hub
that held Battery next to Revert to Windows. Meanwhile Displays, Plugins and Updates — a
one-time arrangement, an occasional install, and a page whose whole job is to tell you when
there is nothing to do — were each one click from the sidebar. Three hubs (Personalization,
Devices & Connections, System) added a step and contributed nothing but a list of links that
the sidebar can hold directly.

So:

**One click, in the Personal group, in this order:** Appearance, Wallpaper, Ridge, Search,
Calendar, Input and language, Window tiling, Battery. Seven of the eight own scalar
settings outright; Input and language owns one — the default input method — wrapped around a
list Windows owns. It is filed here rather than under Devices because you open it for the
same reason you open the rest of the group: to change something to taste. Nobody adds a
French layout because their hardware changed, which is the test the Devices group is for.

Within the group the order is by how much the setting governs, widest first: Appearance and
Wallpaper change every surface, Ridge is the one surface on every screen and holds everything
on it, Search and Calendar change one surface each, Input and language changes one thing —
what your keys type — but changes it in every window on the machine rather than only in
Alpine's, Window tiling changes one behaviour of the shell, and Battery only matters on a
machine that has one.

**One click, in the Devices group:** Displays, Wi-Fi, Bluetooth. These are managers, but they
are the ones you reach for when hardware changes under you, and Alpine already has no other
route to them — Ridge's menus connect to a network, they do not forget one.

**One click to the group, two to the page, in the System group:** Apps (→ Installed, Startup,
Running, Default apps), Plugins, Updates. Four app managers behind one Apps entry is the one
place where a hub still earns its step: the four pages are variations on one list, they are
each used rarely, and collapsing them keeps the sidebar readable.

**From the page they belong to:** Manage tray icons (from the System tray item's callout on
Ridge) and Revert to Windows (from Home). Neither is a destination you go looking for; both
make sense only in the context of the page above them.

Four renames fall out of the same argument:

- **Hotkeys is now Search.** The page never held hotkeys in general — it holds the Search
  hotkey, show recent apps, show bookmarks, show browser tabs and maximum results. Four of
  its five settings are about what Search puts in its results. The registry entry id changed
  from `hotkeys` to `search` with it.
- **Top Bar is now Appearance.** Theme belongs next to the bar colour, not on a page of its
  own holding one control, and "Appearance" is the honest name for a page that holds the theme
  and the colour of the bar. What the bar shows, and where, has since moved to Ridge (below).
  The entry id changed from `topbar` to `appearance`; the individual bar settings keep their
  ids.
- **The top bar is now Ridge, and it has one page.** "Ridge" is the bar's name in everything a
  reader sees. Ids, IPC channels, files and `topbar-layout.json` keep their `topbar` names, so
  no store migrates. The Ridge page draws an editable copy of the bar: items move within and
  between its left, centre and right, hide and come back through "+", and each opens a
  callout holding that item's settings. A result in settings search for an item, or for a
  setting in its callout, opens that callout with the row picked out; if the item is hidden,
  the page says so and offers to add it back. Search hands Settings only a page, so the same
  result there opens Ridge with no callout. The brief asked for one page for the bar, so two
  pages folded into it. System tray's three switches are filed on `ridge` and live in the
  System tray item's callout; Manage tray icons moved to `ridge/tray-icons` with its page id
  kept; and the `tray` entry the launcher opens its tray submenu from is re-filed under
  `ridge`, so the launcher keeps it. The clock's time format moved from Calendar too, because
  it governs the bar's clock; Calendar keeps the Google account and the hover calendar. The
  colour stays on Appearance, with links both ways, because moving it would leave Appearance a
  one-control page again, which is the reason Top Bar became Appearance in the first place.
- **Home absorbed System.** With Battery moved into Personal, the System page held a default
  shell card and a link to Revert. Both describe this PC, which is what Home already is.

## Why a registry, and not more hand-written pages

The argument is not hypothetical, because a registry already existed. `SETTING_COMMANDS` in
`src/components/topbar/launcherSettings.tsx` declared ~30 settings as data — `id`, `label`,
`hint`, `icon`, `keywords[]`, and a `control` union carrying `get`/`set` closures over the
`window.*` bridge — and `launcherPanel.tsx` already scored that list by label **and synonym**
through `scoreField` from `src/lib/launcherSearch.ts`.

So the real choice was never *registry or JSX*. It was:

**(a) Keep a data model and a JSX model side by side.** This was the status quo, and the two
had already drifted. The launcher exposed battery-saver threshold, dim amount, polling and
throttling controls that `batteryPage.tsx` rendered separately with different copy; its
`hotkeys`, `updates` and `system` entries were `navigate` stubs with no control at all; and
`tray`, `tiling` and `startup` opened launcher submenus that no page knew about. Every new
setting had to be added twice, and nothing failed when it was added once.

**(b) Promote the registry out of `components/topbar/`, give each entry the fields a page
needs, and render the launcher *and* the settings pages from it.**

(b) wins on four specific grounds:

1. **It deletes a duplicate instead of adding one.** `launcherSettings.tsx` is gone. There is
   now exactly one place where "Alpine has a setting called X" is written down.
2. **Search is nearly free.** The scorer and the keyword lists already existed and already
   worked. Settings search does not need a new mechanism — it needs the registry to be
   reachable from the settings window too.
3. **A new setting costs an array entry.** Adding a page today costs a component, a route in
   `PageRouter`, an entry in `SEGMENT_LABELS`, a row in the relevant hub, and — if you want
   it findable — a second declaration in the launcher list.
4. **Instant-apply gets one write path to enforce.** `applies` is a required field
   (`'instant' | 'confirm' | 'restart' | 'draft'`), so a new dangerous setting cannot default
   into instant by omission — leaving it out is a compile error. The exception is declared
   next to the setting rather than implied by which page it happens to live on.

Hand-written pages give none of that, and have to be rewritten to add search later — which is
precisely what this initiative is doing to the last surface built that way.

## What the registry deliberately does not cover

**The ~10 device and app managers.** They get *page-level* entries — label, description,
keywords, route, and a control that says how the launcher opens them — and nothing more. No
`read`, no `write`, no `defaultValue`. Search reaches them; nothing renders them from data.
A Wi-Fi network list is not a setting with a value, and pretending otherwise would mean
inventing a control kind that only ever has one implementation.

**Copy that depends on state.** Several descriptions in the current pages are computed:
the Clock callout on Ridge names the detected system format, the tiling Placement
description changes with the selected value, and the tiling Mode explainer is a paragraph
that switches on the mode. The registry carries static `label`, `description` and optional
`hint`. Dynamic copy stays in the page that renders it.

**Conditional visibility.** Whether a control is shown is pervasive and parent-driven —
`settings.enabled`, `config.mode`, `config.handleOversized`, `config.dimDisplays`,
`state.connected`. This is a rendering concern, not a property of the setting, and encoding
it as a predicate on every entry would put page layout back into the data.

Theme, default file handlers and keyboard layout *were* in this paragraph and are no longer.
Theme was a registry entry for a while (`theme`, on the Appearance page) and is now retired:
the settings window always takes the light or dark of Ridge's colour, so `electron/modules/theme.js`
stores nothing; default file handlers now have a page (`apps/defaults`) with a
page-level entry so search can reach it; keyboard layout has a page (`input`) whose entries
carry the search synonyms and the `applies` of each control, and whose lists come from
`electron/modules/keyboardLayout.js` rather than from a value the registry can read and
write.

Three shapes were chosen deliberately and are worth naming, because each trades something:

- **`hint` alongside `description`.** The launcher's copy and the pages' copy had diverged and
  both were good for their surface — "Show the search button on Ridge" reads correctly in a
  one-line result row, "Display the search button on Ridge. The hotkey still works either
  way." reads correctly under a page heading. Rather than pick one and lose the other,
  `description` carries the page copy and the optional `hint` carries the short line. The
  launcher renders `hint ?? description`, so each surface reads the line written for it.
- **Labels are context-free.** A registry entry is read in search results with no surrounding
  page, so its label has to stand alone: "Show search button on Ridge", not "Show search
  icon". The same rule names the Ridge item entries "Clock on Ridge" rather than "Clock", so a
  result says where the clock is. Where the launcher already had a context-free label, it is
  kept verbatim.
- **A `quick-actions` page with a null route.** Volume, mute, emoji and power are reachable
  from Search and have no settings route, because Alpine has no Sound page and power is an
  action rather than a preference. Rather than invent a page or carve an exception into
  "every entry declares where it renders", they are filed under a declared page whose `route`
  is `null` and whose `kind` is `launcher`. The invariant stays total and the gap stays
  visible. The same reasoning applies to `group: 'Page'` on page-level entries: they render
  nothing, so they are filed under a group that says so.

**Plugin settings sit beside the registry, not in it.** A plugin declares toggles, selects and
sliders under `contributes.settings`, and may declare a page under `contributes.settingsPages`.
Both are wired up: the settings show in the Ridge callout of the plugin group that holds the
plugin's widgets, and on the plugin's own page at `plugins/<id>`, which its row on the Plugins
page opens and which `topLevel: true` also lists in the sidebar. They are not appended to
`SETTINGS_REGISTRY`. Each declaration becomes a value entry when it is drawn
(`src/plugins/pluginSettingEntries.ts`), so plugin rows reuse `ValueRow` and `useSettingsValue`
while staying out of search and out of the invariants this record argues for built-in settings.
`LauncherCommandContribution` is still not wired up.

### One shape the type system could not express

`SettingsEntry` is a two-arm union — a value entry and a panel entry — rather than one arm per
control kind. Per-kind arms are the more precise model (a toggle's `write` would take a
`boolean`, a slider's a `number`), but TypeScript resolves an object literal against a union
by discriminant, and `control.kind` is a *nested* discriminant it does not use. The result was
that contextual typing inside `read()` collapsed and every entry failed to type-check with an
error naming the wrong union arm. The fix would have been either an explicit return-type
annotation on every `read`, or a factory function per control kind — both of which make adding
a setting more ceremony than adding an array entry, which was the point.

So the value type is the `SettingsValue` union and the control-kind-to-value-type invariant is
enforced by a test (`matches every default value to the type its control edits`) instead of by
the compiler. That is a real trade, stated here so the next person does not "fix" it back.

## What is known about how these settings are used: nothing

This is the part that would be easy to fake, so it is stated plainly.

**There is no usage evidence for this decision, and the page order is not derived from
measurement.**

- **No telemetry.** `grep -rniE "\b(telemetry|analytics|posthog|mixpanel|sentry|amplitude)\b"`
  across the repository returns exactly one hit, and it is prose in `docs/plugin-system.md`
  describing what a malicious plugin must not be able to exfiltrate. There is no analytics
  dependency, no event pipeline and no counter anywhere in the shell.
- **No issues.** `gh issue list --repo AlpineShell/shell --state all` returns an empty list.
  The board this work is tracked on lives outside the repository.
- **No readable support conversations.** The website's support form
  (`AlpineShell/website:src/app/api/support/route.ts`) is an email relay into an inbox. The
  inbox is not readable from this repository, and nothing in the repository summarises it.
- **No overridden defaults to measure.** The per-module JSON files under
  `app.getPath('userData')` are per-machine and are not collected anywhere.

The one piece of designed intent that *is* in the repository is `SETTING_COMMANDS` — a
hand-curated list of about 30 settings that somebody judged worth reaching from the launcher
without opening the settings window at all. That is a statement of intent, not a measurement
of behaviour, and it is the only signal this decision has.

So: the page order below is argued from the inventory (settings grouped by the module that
stores them) and from which settings were already judged worth putting in the launcher. It is
designed intent. It is not evidence that anyone opens the Tiling page more often than the
Calendar page, and no such claim is made here. When telemetry or a readable support channel
exists, this section should be replaced with what it says — and the order re-argued, not
retro-fitted.

## Scope of the change that introduced this

The registry and this record landed together with exactly one consumer rewired: the launcher.
`launcherSettings.tsx` was deleted and `launcherPanel.tsx` now scores registry entries. The
22 settings pages were left untouched and kept working exactly as they did. Rewriting them
from the registry was a separate card, which is what made both reviewable.

## What the follow-up changed

The six scalar pages — Appearance (was Top Bar), Calendar, Search (was Hotkeys), System tray
(since folded into Ridge), Window tiling and Battery — now render from the registry through
`src/components/settings/registryPage.tsx`. It reads the entries for a page, groups them,
renders each `control` kind with the shared components from `@alpine/ui`, and reads and
writes through the entry's own `read` / `subscribe` / `write` via `hooks/useSettingsValue.ts`.

Two escape hatches keep the bespoke pieces bespoke, and they are worth naming because they
are the whole reason the registry did not have to grow a control kind per one-off:

- **A slot adds content to a group.** The Google connect card, the Manage icons link, the
  tiling mode explainer and the "no battery detected" note are page-supplied nodes filed
  under a group and an order, sitting in the same list as the registry-driven rows.
- **A slot can `replace` entries.** The Ridge colour swatch picker replaces `topbar-color` and
  `topbar-color-automatic`; the three-way battery override replaces `battery-saver`. The
  entries stay in the registry, so search still finds them and the launcher still renders its
  inline toggle — the page just draws a richer control in their place.

Conditional visibility stayed a page concern, as this record argued it should: a page passes
the ids it wants hidden. It computes them from the same registry values the rows use, through
`hooks/useSettingsValue.ts`, which keeps one store per entry rather than one per component.
That is what makes a reveal optimistic: flipping *Enable window tiling* shows the sections it
gates in the same frame, because the row's write and the page's visibility read the same
value. It also means one `read()` and one `subscribe()` per entry however many rows use it,
a value that survives a row unmounting and remounting, and a pending-write guard so an echoed
broadcast cannot drag a slider backwards under the user's thumb.

The route table moved into `src/components/settings/settingsRoutes.tsx` and is checked against
`SETTINGS_PAGES` by a test. Before, a route could be renamed in the registry and forgotten in
`PageRouter`, and nothing — not typecheck, not a test — would say so; the page just rendered
blank. `SEGMENT_LABELS` is gone: the breadcrumb, the sidebar and the taskbar entry all read
their labels from `settingsPageByRoute`.

One invariant was replaced rather than kept. `starts every routed page path with its section
path` described the old structure, where a route's first segment had to be its section id.
The routes are flat now, so the useful invariant is the one the breadcrumb actually depends
on: every ancestor path of a nested route is itself a declared page.

## Input and language: the first page whose entries disagree about `applies`

Until now every entry on a page shared one value of `applies`, and the field read as
documentation. The `input` page is the first where it had to be argued per control, because
the controls genuinely differ:

- **`keyboard-layouts`** (add a layout, move one up or down) and **`default-input-method`**
  are `instant`. Both are per-user HKCU writes — `Set-WinUserLanguageList` and
  `Set-WinDefaultInputMethodOverride` from the PowerShell `International` module — both take
  effect without a sign-out, neither asks for elevation, and undoing either is doing the
  opposite.
- **`keyboard-layout-remove`** is `confirm`, and the page only spends the confirmation where
  it is owed. Dropping a spare layout from a language that has several is exactly as
  reversible as adding it, so it goes straight through. Two removals are not: the *last*
  layout of a language leaves that language with nothing to type in, and the layout that is
  the *default input method* silently hands the default to whatever is first in the list.
  Those stop in the row and name which case it is before doing anything.
- **`language-add`** is `instant` and **`language-remove`** is `confirm`. Adding a language
  appends it to the same `Set-WinUserLanguageList` write, and Windows attaches that
  language's usual layout. Removing one drops every layout it carries at once, so it asks
  first, and the last language offers no remove at all because Windows needs one. Both
  re-read the list afterwards and report it when Windows did not do what was asked.
- **`switch-input-method`** is `instant` and best effort. Changing the active layout affects
  the calling thread, so a shell can only ask: it posts `WM_INPUTLANGCHANGEREQUEST` to the
  foreground window. Windows may ignore it, and the foreground window is the settings window
  while you are clicking in it. The page says both.

The honest limit in that list is the second one. "The layout currently in use" would be the
better trigger for the confirmation, but the module publishes the *declared* default, not the
active layout of whatever thread has focus, and the active layout of the settings window is
not a useful answer to the question. The default input method is the closest thing the
contract exposes, so that is what the page checks.

## Instant apply: one write path, and the exceptions argued individually

Everything in the settings window takes effect and persists the moment it is made, through one
function. The handful of places where instant is the wrong answer are declared on the entry, in
`applies`, and argued in the table below — one row per registry entry, so a setting that is
instant says so rather than being instant by omission.

### The write path

`src/hooks/useSettingsValue.ts` is the only thing that writes a registry-driven value. Every
surface goes through it: the settings pages via `registryPage.tsx`, the settings search results,
and — as of this change — the launcher, which had a second copy of the optimistic-write logic
that reverted a failed toggle but silently swallowed a failed slider write and never reconciled
against a backend broadcast at all.

It does four things, and the order matters:

1. **It dispatches on `applies`.** `instant` writes immediately. `restart` writes immediately and
   then raises a flag the row renders as *Restart Alpine Shell to finish applying this*.
   `confirm` and `draft` do **not** write: they stage the value, and it reaches `entry.write`
   only when something calls `confirm()`. For `confirm` that is the row's own Apply button. For
   `draft` it is the page, which owns an apply/keep/revert flow the registry cannot describe —
   `registryPage.tsx` deliberately renders nothing for a `draft` value entry, and a test holds
   the line that every `draft` entry is a panel entry whose page implements the flow.
2. **It makes partial application impossible.** The store update and the effect are the same
   call — `entry.write` is the IPC that both persists and applies — so there is no window in
   which one has happened and the other has not. If that call rejects, the path re-reads the
   entry and publishes what the backend actually holds, so the control snaps back to the truth
   instead of sitting on the optimistic value, and the rejection message is rendered under the
   row.
3. **It keeps the optimistic update**, because that is what makes the surface feel instant, and
   reconciles it against the broadcast the backend sends — the fetch-then-subscribe shape
   `useShellState` already uses. A pending-write counter drops echoed broadcasts while a write is
   in flight, so a stale echo cannot drag a slider backwards under the user's thumb.
4. **It holds one store per entry**, not one per component, so the launcher row, the page row and
   the search result for the same setting cannot disagree.

**Ridge's actions span two stores, so they are ordered to fail hidden.** The Search button and
the tray are shown by their own flags (`topbar-search-icon`, `tray-enabled`), and every other
item by `topbar-layout.json`. Bringing a hidden Search button back therefore clears its hidden
mark in the layout and then turns its flag on, and Reset turns the search flag off, writes the
default layout, then turns the tray flag on. Each of those writes is still one `entry.write`
or one `setLayout`, so no store is ever half-written as point 2 promises, but the action as a
whole could stop between two of them. The order makes stopping early harmless: writes that
hide come first, writes that show come last, and the sequence stops at the first rejection,
so a failure leaves an item hidden rather than half-shown. `writeSettingsValue` resolves to
whether its write landed so that `useRidgeEditor` can await each step before the next. Hiding
the Search button or the tray writes only its flag.

### One write that could half-apply, and no longer can

`launcherHotkey.js` was the real instance of the failure mode this card exists to prevent.
`setHotkey` unregistered the old binding, saved the new hotkey to `launcher-hotkey.json`,
broadcast it as applied, and *then* called `globalShortcut.register`. When registration failed —
which is what happens when another app already owns the combination — it logged
`register returned false` and carried on. The result was a shell with no launcher hotkey bound at
all, a store that claimed otherwise, and a settings row showing the new combination: neither the
old state nor the new one, and it survived a restart.

It now binds first and only persists what bound. `rebind` tries the requested combination, and on
failure puts the previous one back and reports `{ ok: false }`; `setHotkey` writes the store and
broadcasts only on success. `launcher/hotkey-set` returns that result, and the registry entry's
`write` rejects when `ok` is false, so the recorder snaps back to the hotkey that is actually
bound and says why. Search keeps working throughout.

### The table

`applies` is a required field on `SettingsEntry`, so omitting it is a compile error, and
`registry.test.ts` fails if an entry carries anything other than one of the four values — a new
dangerous setting cannot fall into instant by being forgotten. A second test pins every
non-instant entry below, so downgrading one to instant fails the suite rather than passing
review. A third test checks this table against the registry, so an entry with no row here is a
test failure too.

| Entry | `applies` | Why |
|---|---|---|
| `wifi` | instant | Connecting to a network is a manager action with an obvious undo: connect to another, or turn Wi-Fi off. |
| `bluetooth` | instant | Same as Wi-Fi. Pairing is reversible from the same list that did it. |
| `displays` | draft | The one change that can leave you unable to undo it, because the undo is on a screen that just went black. Edit a draft, press Apply, and a 15-second countdown reverts unless you confirm — `displaysPage.tsx` against `applyDisplayLayout` / `keepDisplayLayout` / `revertDisplayLayout`. This is the model for `draft`. |
| `brightness` | instant | A slider you can see the effect of while dragging, and drag back. |
| `wallpaper` | instant | Visible immediately, reversible by picking another. |
| `ridge` | instant | A page-level entry. The Ridge page writes each move as it is made, and every move is undone by moving the item back; the settings in its callouts each declare their own. |
| `ridge-item-system-menu` | instant | A search entry for the Power menu on Ridge. From settings search it opens the item's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-item-plugins-left` | instant | A search entry for the Left plugins group on Ridge. From settings search it opens the group's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-item-media` | instant | A search entry for Media on Ridge. From settings search it opens the item's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-item-microphone` | instant | A search entry for the Microphone on Ridge. From settings search it opens the item's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-item-status` | instant | A search entry for the Status icons on Ridge. From settings search it opens the item's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-item-plugins-right` | instant | A search entry for the Right plugins group on Ridge. From settings search it opens the group's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-item-clock` | instant | A search entry for the Clock on Ridge. From settings search it opens the item's callout; from Search it opens Ridge without one. It writes nothing itself. |
| `ridge-layout-reset` | confirm | Throws the whole arrangement away: every item back on its first side and in its first place, shown, with the Search button off and the tray on. Nothing restores the arrangement you had, so it asks once, on the shared confirm button. It writes the search flag, then the layout, then the tray flag, and stops at the first one that is refused (see the write path above). |
| `power-confirm` | instant | Whether Ridge's power menu asks a second time before Log Out, Restart or Shut Down. On by default, because those actions can lose unsaved work (see `power`). Turning it off only removes a second click and turning it on adds it back; nothing runs when it flips. One Enter on its search row flips it, which is acceptable because that row shows a switch and says which way it went. Search's own power submenu always asks, whatever this is set to. |
| `power-show-hibernate` | instant | Whether Hibernate shows in the power menus on Ridge and in Search, and as a search command. On by default, but it only shows while Windows has hibernation turned on, and the switch reads off while it is off; Alpine never asks for administrator rights on its own. Turning the switch on while Windows has hibernation off is the one place that asks: it runs `powercfg /hibernate on` elevated, and if the prompt is declined the switch falls back to off. Turning it off only removes the entries. |
| `topbar-color` | instant | A colour. Clearing the override restores the automatic one. A fresh install starts on #202020 with light text on every wallpaper, so Ridge looks the same however the desktop changes; a store that already holds a choice, Automatic included, keeps it. |
| `topbar-color-automatic` | instant | Freezes or resumes wallpaper-following. Both directions are one click. |
| `topbar-adapt-to-apps` | instant | Lets Ridge take the colour of a maximized app in front, or stops it. Nothing is lost either way: turning it off hands Ridge back its own colour, and turning it on picks the app up again. |
| `topbar-search-icon` | instant | Shows or hides the Search button on Ridge, and is its only visibility switch: hiding the button from Ridge writes this and nothing else. The hotkey works either way, so it cannot strand you. |
| `media-visualizer` | instant | Swaps one glyph of the Media item on Ridge for another. |
| `clock-time-format` | instant | Reformats the clock on Ridge and nothing else. Filed on Ridge rather than Calendar because it governs the bar's clock; its result in settings search opens the Clock callout with the row picked out. |
| `calendar-days` | instant | Changes how many days the hover calendar draws. |
| `calendar-show-tasks` | instant | Adds or removes a section of the hover calendar. |
| `search` | instant | A page-level entry; its settings declare their own. |
| `launcher-hotkey` | instant | Instant, but atomic — see above. Binding is attempted before anything is written, and a combination another app owns is refused with the old one left bound, rather than half-applied. Instant is right because the outcome is now either fully applied or fully rejected, and Search stays reachable in both cases. |
| `browser-bookmarks` | instant | Adds or removes one source of Search results. Nothing outside Alpine changes. |
| `browser-tabs` | instant | Adds or removes one source of Search results. No tab is touched either way. |
| `launcher-max-results` | instant | A row count between 3 and 8, visible the next time you search. |
| `input` | instant | A page-level entry; the page's controls disagree about `applies` and each declares its own. |
| `keyboard-layouts` | instant | Adding a layout or reordering the list is a per-user `Set-WinUserLanguageList` write that needs no sign-out and is undone by doing the opposite. |
| `keyboard-layout-remove` | confirm | Removing a spare layout goes straight through. Removing the last layout of a language, or the one that is the default input method, stops and names which case it is first — those two leave you with nothing to type in, or silently hand the default to whatever is first in the list. |
| `language-add` | instant | Adding a language is the same per-user `Set-WinUserLanguageList` write as adding a layout: no elevation, no sign-out, and removing the language again undoes it. |
| `language-remove` | confirm | Removing a language takes every layout attached to it off the list in one write, so the button asks before it does anything. The last language has no remove button at all, because Windows needs at least one. |
| `switch-input-method` | instant | Best effort by construction: it posts `WM_INPUTLANGCHANGEREQUEST` to the foreground window, which Windows may ignore. Nothing is persisted, so there is nothing to half-apply. |
| `default-input-method` | instant | `Set-WinDefaultInputMethodOverride`, per-user, no elevation, no sign-out, undone by choosing another. |
| `tray` | instant | A page-level entry, filed under Ridge now that the System tray page has folded into it. The launcher opens its tray submenu from it, and the tray's own settings each declare their own. |
| `tray-enabled` | instant | Shows or hides the System tray item on Ridge, and is the tray's only visibility switch. The story flagged hiding things on the bar as a way to lose the route to settings, and Ridge sharpens that: Status, the power menu and the tray can each be hidden, and hiding Status takes away the Settings gear in its pop-over (`controlCenter.tsx`). It still cannot strand anyone, and this was checked rather than assumed. The Search hotkey is always bound: a combination another app owns is refused with the old one left bound, and an empty one falls back to Win (`launcherHotkey.js`). Search opens Settings and has its own power submenu (`launcherPanel.tsx`) whatever Ridge shows, and Reset on the Ridge page puts every item back. Nothing about turning it off is one-way. |
| `tray-overflow` | instant | Shows or hides the overflow chevron in the tray on Ridge; the icons behind it are still there, and Manage tray icons still lists them. |
| `tray-icons` | instant | Reordering and hiding icons, one level below Ridge at `ridge/tray-icons`; every move has an opposite move on the same page. |
| `tray-all-monitors` | instant | Draws the tray on Ridge on one monitor or on all of them. |
| `tiling` | instant | A page-level entry; the tiling settings each declare their own. |
| `tiling-enabled` | instant | Flipping this does rearrange every open window at once, which is why it is on the list of things to argue rather than assume. It is still instant, because it is symmetrical: turning it off stops managing windows and turning it on tiles them again, nothing is destroyed, and no window closes. A confirmation here would buy nothing that the same click in reverse does not. |
| `tiling-mode` | instant | Same argument. Snap and dynamic are two ways of arranging the same windows, and switching back rearranges them again. The page already explains what each mode does before you pick. |
| `tiling-hotkeys` | instant | Enables or disables Win+Arrow snapping, and nothing already snapped moves. |
| `tiling-drag-to-zone` | instant | Enables or disables drag-to-edge. |
| `tiling-dynamic-layout` | instant | Picks which layout the dynamic mode arranges into; picking another rearranges. |
| `tiling-split-sizes` | instant | Picks the ratios a split uses; every value has another value. |
| `tiling-gap` | instant | The pixels between tiles, and you watch it change as you drag. |
| `tiling-margin` | instant | The pixels around the outside, and you watch it change as you drag. |
| `tiling-handle-oversized` | instant | Whether oversized windows are kept on screen. |
| `tiling-oversized-placement` | instant | Where an oversized window sits; the other choice puts it back. |
| `battery-saver` | instant | Forces battery saver on or off. Both directions are one control. |
| `battery-saver-automatic` | instant | Whether the threshold applies at all. |
| `battery-saver-threshold` | instant | The percentage battery saver switches on at. |
| `battery-saver-dimming` | instant | Whether displays dim while saving. |
| `battery-saver-dim-amount` | instant | How much they dim; baselines are stored so the original brightness comes back. |
| `battery-saver-dim-externals` | instant | Whether external monitors dim too. |
| `battery-saver-polling` | instant | Slows Alpine's own background checks. |
| `battery-saver-throttling` | instant | The story flagged this because it changes process priorities. Checked: `powerThrottling.js` sets the EcoQoS execution-speed bit over `app.getAppMetrics()`, which is Alpine's own processes only — not the machine's — and turning it off writes the same bit back to zero on the same processes. One flag, scoped to us, exactly reversible. Instant. |
| `apps-running` | instant | A page-level entry; the page lists processes and the one action on it declares its own. |
| `app-force-close` | confirm | `apps/end-task` is `taskkill /F` — a forced kill with no chance to save, on somebody else's app. It was firing on one click of a button labelled Close. It now asks, and the confirmation says Force close so the label stops understating what happens. |
| `apps-installed` | instant | A page-level entry. Opening an app or its folder is instant; the destructive action below is not. |
| `app-uninstall` | confirm | Irreversible, and it was firing on one click. Removing an app means reinstalling it to undo, if you can still find it. Now a two-step confirm naming the app. |
| `startup` | confirm | Not a UI choice. Windows puts a change to a system-owned startup entry into a `pending` state that needs explicit approval before it takes effect; `Toggle` renders `pending` with a warning ring and the page offers Approve. Documented rather than changed. |
| `apps-defaults` | confirm | Alpine does not write file associations — the page hands off to the Windows default-apps picker, which asks before changing one. The confirmation exists; it belongs to Windows. Declared so the next person does not add an Alpine control that skips it. |
| `plugins` | instant | Was `restart`, and that was wrong: `plugins/set-enabled` calls `triggerReload()`, which broadcasts `plugins/reload` and re-reads contributions live. Installing and enabling take effect without restarting anything. |
| `plugin-uninstall` | confirm | Irreversible — it deletes the plugin's directory — and it was firing on one click of a trash icon. Now a two-step confirm naming the plugin. |
| `updates` | restart | An update installs and then needs a restart to run. `updatesPage.tsx` already surfaces that and offers the restart. |
| `revert` | confirm | The shell replaces itself with Explorer, and one of the three actions deletes Alpine entirely. Two-step confirm, already correct, now on the shared confirm affordance so it looks like every other confirmation. |
| `system` | instant | A page-level entry for a page that only reports what this PC is; it writes nothing. |
| `volume` | instant | A slider whose result you hear while dragging, and can drag back. |
| `mute` | instant | One click each way, and you hear which way it went. |
| `emoji` | instant | Inserts a character into whatever has focus. Nothing is stored. |
| `power` | confirm | Shut down, restart, sign out and lock all end the session and can lose unsaved work in every app. The launcher's power submenu already asks a second time before running one. |
| `high-performance-gpu` | restart | Chromium picks its graphics adapter once, when the process starts: the `force_high_performance_gpu` switch and the Windows `UserGpuPreferences` value for the exe are both read then, so a change only takes effect after a restart. Off by default, because Ridge and the desktop always hold a window open, which keeps the discrete GPU of a hybrid-graphics laptop powered all day. Turning it on is for anyone whose animations stutter on the integrated chip, and turning it off again removes the Windows value. |

### What is not covered

The write path covers registry-driven values. The device and app managers keep their own state —
a Wi-Fi list, a plugin list, a display arrangement — and the registry only declares how their
actions apply, which is what the `confirm` rows above are for. The confirmation itself is a
shared component (`ConfirmButton` from `@alpine/ui`) so that a `confirm` declaration and the
thing the user actually sees stay the same shape wherever they appear.

### Persistence

Every entry in the table writes through an IPC handler whose module owns one JSON file under
`app.getPath('userData')` and writes it inside the same handler that applies the effect:
`topbar-color.json`, `topbar-layout.json`, `clock-prefs.json`, `launcher-prefs.json`,
`launcher-hotkey.json`, `tray-layout.json`, `tiling.json`, `battery-saver-prefs.json`,
`wallpaper.json`, `foreground-color.json`, `power-prefs.json`, `gpu-prefs.json`. That is what makes the guarantee in point 2
above hold: there is no separate save step that could be skipped, so a value that reached the
store is a value that survives a restart.
