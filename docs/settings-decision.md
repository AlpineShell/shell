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
| Appearance | theme (system / light / dark) | `electron/modules/theme.js` → `theme.json` |
| Appearance | colour override, automatic colour, show search icon, show media visualizer | `electron/modules/topbarColor.js` → `topbar-color.json` |
| Calendar | time format (auto/12h/24h), days shown (1/2/3), show Google Tasks | `electron/modules/clockPrefs.js` → `clock-prefs.json` |
| Search | Search hotkey, show recent apps, show bookmarks, show browser tabs, maximum results | `electron/modules/launcherHotkey.js` → `launcher-hotkey.json`, `electron/modules/launcherPrefs.js` → `launcher-prefs.json` |
| System Tray | show tray, show overflow arrow, show on all monitors | `electron/modules/trayLayout.js` → `tray-layout.json` |
| Window Tiling | enabled, mode, Win+Arrow snapping, drag-to-zone, dynamic layout, split ratios, gap, outer margin, keep-oversized, placement | `electron/modules/tiling.js` → `tiling.json` |
| Battery | force battery saver, automatic, threshold %, dim displays, dim by %, dim external monitors, reduce background polling, throttle processes | `electron/modules/batterySaver.js` + `batterySaverPolicy.js` → `battery-saver-prefs.json` |
| Wallpaper | wallpaper source and selection | `electron/modules/wallpaper.js` → `wallpaper.json` |
| — (Search only) | volume, mute, emoji, power | live system state, not a prefs file |

### B. Device and app managers — lists with actions

Wi-Fi networks, Bluetooth devices, the Displays canvas, Running apps, Installed apps,
Startup apps, Plugins, Updates, Tray icon ordering, Revert to Windows. These are not
settings. They are lists of things that exist outside Alpine, with per-item actions
(connect, pair, uninstall, apply, revert). A registry cannot own them.

### The page order this implies

The registry declares 21 pages: the 20 routes `settingsApp.tsx` renders, plus one
launcher-only page (below). The sidebar has four groups — Home, Personal, Devices, System —
and every page in it is one click away.

The order comes out of the A/B split above, not out of a claim about what people use.

**Group A is what you tune; group B is what you set up.** A scalar setting is a preference
that follows taste and context, and taste changes: the theme changes with the light in the
room, the top bar colour with the wallpaper, the tiling gap when you get a second monitor,
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

**One click, in the Personal group, in this order:** Appearance, Wallpaper, Search, Calendar,
System tray, Window tiling, Battery. These are the seven pages that own scalar settings.
Within the group the order is by how much of the shell the setting governs, widest first:
Appearance and Wallpaper change every surface, Search and Calendar change one surface each,
System tray and Window tiling change one behaviour each, and Battery only matters on a
machine that has one.

**One click, in the Devices group:** Displays, Wi-Fi, Bluetooth. These are managers, but they
are the ones you reach for when hardware changes under you, and Alpine already has no other
route to them — the top bar menus connect to a network, they do not forget one.

**One click to the group, two to the page, in the System group:** Apps (→ Installed, Startup,
Running, Default apps), Plugins, Updates. Four app managers behind one Apps entry is the one
place where a hub still earns its step: the four pages are variations on one list, they are
each used rarely, and collapsing them keeps the sidebar readable.

**Two clicks, from the page they belong to:** Manage tray icons (from System tray) and Revert
to Windows (from Home). Neither is a destination you go looking for; both make sense only in
the context of the page above them.

Three renames fall out of the same argument:

- **Hotkeys is now Search.** The page never held hotkeys in general — it holds the Search
  hotkey, show recent apps, show bookmarks, show browser tabs and maximum results. Four of
  its five settings are about what Search puts in its results. The registry entry id changed
  from `hotkeys` to `search` with it.
- **Top Bar is now Appearance.** Theme belongs next to the top bar colour, not on a page of
  its own holding one control, and "Appearance" is the honest name for a page that holds
  the theme and the colour and contents of the bar. The entry id changed from `topbar` to
  `appearance`; the individual top bar settings keep their ids.
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
the Calendar time-format subtitle names the detected system format, the tiling Placement
description changes with the selected value, and the tiling Mode explainer is a paragraph
that switches on the mode. The registry carries static `label`, `description` and optional
`hint`. Dynamic copy stays in the page that renders it.

**Conditional visibility.** Whether a control is shown is pervasive and parent-driven —
`settings.enabled`, `config.mode`, `config.handleOversized`, `config.dimDisplays`,
`state.connected`. This is a rendering concern, not a property of the setting, and encoding
it as a predicate on every entry would put page layout back into the data.

**Keyboard layout.** Configurable in the shell, with no UI. It is not in the registry
because it is not a settings page yet; adding it is a card of its own.

Theme and default file handlers *were* in this paragraph and are no longer. Theme is now a
registry entry (`theme`, on the Appearance page) backed by a stored preference in
`electron/modules/theme.js`; default file handlers now have a page (`apps/defaults`) with a
page-level entry so search can reach it.

Three shapes were chosen deliberately and are worth naming, because each trades something:

- **`hint` alongside `description`.** The launcher's copy and the pages' copy had diverged and
  both were good for their surface — "Show the search button in the top bar" reads correctly
  in a one-line result row, "Display the search button in the top bar. The hotkey still works
  either way." reads correctly under a page heading. Rather than pick one and lose the other,
  `description` carries the page copy and the optional `hint` carries the short line. The
  launcher renders `hint ?? description`, so every existing result row is byte-identical to
  what it showed before.
- **Labels are context-free.** A registry entry is read in search results with no surrounding
  page, so its label has to stand alone: "Top bar search icon", not "Show search icon". Where
  the launcher already had a context-free label, it is kept verbatim — which also means the
  fuzzy scorer sees exactly the strings it saw before.
- **A `quick-actions` page with a null route.** Volume, mute, emoji and power are reachable
  from Search and have no settings route, because Alpine has no Sound page and power is an
  action rather than a preference. Rather than invent a page or carve an exception into
  "every entry declares where it renders", they are filed under a declared page whose `route`
  is `null` and whose `kind` is `launcher`. The invariant stays total and the gap stays
  visible. The same reasoning applies to `group: 'Page'` on page-level entries: they render
  nothing, so they are filed under a group that says so.

**Plugins are not implemented here.** `packages/plugin-sdk/src/contributions.ts` already
declares `SettingsPageContribution` and `LauncherCommandContribution { keywords }`, and
`electron/pluginManifest.js` allow-lists `settingsPages`. Neither is wired up, and this card
does not wire them up. The shape does not prevent it: `SETTINGS_PAGES` and `SETTINGS_REGISTRY`
are plain arrays of plain objects with no build-time-only types, and every consumer goes
through `settingsEntry()` / `settingsPage()` lookups over a map built from them, so a
runtime-appended entry is a matter of rebuilding those maps rather than changing the model.

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

The six scalar pages — Appearance (was Top Bar), Calendar, Search (was Hotkeys), System tray,
Window tiling and Battery — now render from the registry through
`src/components/settings/registryPage.tsx`. It reads the entries for a page, groups them,
renders each `control` kind with the shared components in `src/components/ui/`, and reads and
writes through the entry's own `read` / `subscribe` / `write` via `hooks/useSettingsValue.ts`.

Two escape hatches keep the bespoke pieces bespoke, and they are worth naming because they
are the whole reason the registry did not have to grow a control kind per one-off:

- **A slot adds content to a group.** The Google connect card, the Manage icons link, the
  tiling mode explainer and the "no battery detected" note are page-supplied nodes filed
  under a group and an order, sitting in the same list as the registry-driven rows.
- **A slot can `replace` entries.** The top bar swatch picker replaces `topbar-color` and
  `topbar-color-automatic`; the three-way battery override replaces `battery-saver`. The
  entries stay in the registry, so search still finds them and the launcher still renders its
  inline toggle — the page just draws a richer control in their place.

Conditional visibility stayed a page concern, as this record argued it should: a page passes
the ids it wants hidden, computed from its own live state.

The route table moved into `src/components/settings/settingsRoutes.tsx` and is checked against
`SETTINGS_PAGES` by a test. Before, a route could be renamed in the registry and forgotten in
`PageRouter`, and nothing — not typecheck, not a test — would say so; the page just rendered
blank. `SEGMENT_LABELS` is gone: the breadcrumb, the sidebar and the taskbar entry all read
their labels from `settingsPageByRoute`.

One invariant was replaced rather than kept. `starts every routed page path with its section
path` described the old structure, where a route's first segment had to be its section id.
The routes are flat now, so the useful invariant is the one the breadcrumb actually depends
on: every ancestor path of a nested route is itself a declared page.
