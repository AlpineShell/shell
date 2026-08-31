# Manual Test Matrix: Window-Aware Process Governor

The governor watches windows and applies levers — EcoQoS, priority class, suspend, working-set trim —
to processes it believes nobody is looking at. Getting that wrong is not a cosmetic bug: it stutters a
voice call, halves a build, or leaves a stranger's process suspended after Alpine dies.

Almost none of it is observable in CI. The runner is Linux, so only the pure policy modules — the ones
that take a window snapshot and return a classification, with no koffi and no `electron` import — have
automated tests. Every lever below touches a real Win32 process and needs a Windows box, a human, and
this document.

## How to use this document

Work top to bottom. Each item names what to do, what to expect, and **which tool to read it in**. An
item passes only when the tool agrees — not when the app feels fine.

> The Activity panel is the governor's *claim*. Task Manager and System Informer are the OS's *answer*.
> Never sign off an item on the panel alone. A panel that says "napping" while the Details tab says
> `Power throttling: Disabled` is itself a failure, and several items below exist only to catch that.

Item numbers are stable identifiers. A governor story's acceptance criteria should read "passes 1.1–1.7
and 8.4" and link the anchor (`docs/governor-test-matrix.md#11-music-behind-a-covered-window`). So:
**append new items to the end of a section, and never renumber or reuse a number.** If an item stops
making sense, strike its text and leave the number sitting there.

### Vocabulary

The epic classifies every window-owning process as one of three states, and the Activity panel shows
them by these names:

- **Interactive** — foreground, or otherwise in use. No lever is ever applied.
- **Occluded** — fully covered by other windows, but the process is still expected to work at full
  speed. Downloads, compiles, and anything making sound live here.
- **Napping** — minimized, cloaked, or occluded long enough that levers apply.

A **lever** is one reversible change the governor makes to another process. The **journal** is the
on-disk record of every lever currently applied, so that a crash does not strand one.

## Observation tools

Set all of these up before you start. Keep the Activity panel open on a second monitor.

### Task Manager

- **Processes tab** — right-click the column header and enable the **Efficiency mode** column. The leaf
  marks a process Windows reports as power-throttled.
- **Details tab** — right-click the header, *Select columns*, and add **Power throttling**, **Base
  priority**, **Status**, and **Threads**. `Power throttling: Enabled` is the authority on EcoQoS.
- Task Manager's `Status` column is not trustworthy for a Win32 process whose threads were suspended
  directly; it often still reads *Running*. Use System Informer for suspend state.

### System Informer or Process Explorer

Everything Task Manager will not show you: **I/O priority** and **page priority** (process properties,
General tab), per-thread suspend state (Threads tab — a suspended process shows every thread in a
suspended wait), working-set breakdown, and handle/thread counts for the leak check in 11.1.

### PowerShell

The scriptable before/after snapshot. Take one before an experiment and one after:

```powershell
Get-Process | Select-Object Name, Id, PriorityClass | Sort-Object Name |
  Export-Csv "$env:TEMP\gov-before.csv" -NoTypeInformation
```

```powershell
Compare-Object (Import-Csv "$env:TEMP\gov-before.csv") (Import-Csv "$env:TEMP\gov-after.csv") `
  -Property Name, Id, PriorityClass
```

Reading `PriorityClass` on an elevated or protected process from an unelevated console raises *Access
is denied*. That is expected, and section 10 leans on it deliberately.

### PerfMon and Get-Counter

Working-set trims are paid for in hard page faults the next time the app is touched. Watch the machine
during a wake:

```powershell
Get-Counter '\Memory\Page Reads/sec' -Continuous -SampleInterval 1
```

```powershell
Get-Counter '\Process(devenv*)\Working Set - Private' -Continuous -SampleInterval 1
```

PerfMon's graph view is easier to read for the wake items in section 3; `Get-Counter` is easier to
paste into the pass log.

### Frame timing

For the wake-latency items, a stopwatch is useless — the whole budget is smaller than human reaction
time. Record the screen at 60 fps or higher and count frames from the keystroke to the first painted
frame. If the build carries the foreground-switch perf probe, use it instead and say so in the log.
For the game items, use the game's own frame-time counter or PresentMon.

## Before every pass

1. Record the build under test: `git rev-parse --short HEAD`, or the installer version if you are
   testing a packaged build. Record the Windows build from `winver`.
2. Record the hardware: CPU, RAM, GPU, monitor topology with each monitor's scaling and refresh rate,
   and whether the machine has a battery.
3. **Capture the baseline with Alpine not running.** Screenshot the Efficiency mode column and export
   the PowerShell snapshot. Windows sets efficiency mode on its own — Energy Saver on recent builds
   marks processes broadly — and without a baseline you will spend an afternoon blaming the governor
   for Windows' work. A pass recorded without a baseline is not a pass.
4. Close anything else that manipulates process priority: Process Lasso, Razer Cortex, MSI Afterburner
   profiles, vendor "game boosters".
5. Check hardware coverage. **At least one machine in the pass must have a hybrid CPU** (Intel 12th gen
   or newer, or a recent AMD with mixed core types). EcoQoS parks a process on the efficiency cores
   there, so a compile that is 3% slower on a homogeneous CPU can be far worse on a hybrid one — a
   whole class of throughput bugs is invisible on the wrong machine. Sections 6 and 7 need a laptop.

## 1. Audio and calls

**The highest-value section in this matrix.** If you only have an hour, run this one. Audio glitching
is the failure users notice first, report worst, and forgive least — and it is caused by exactly the
kind of "it's covered, nobody's using it" reasoning the governor is built on.

### 1.1 Music behind a covered window

- **Setup**: a desktop music player (Spotify, foobar2000, Groove) playing a local file or a stream.
- **Do**: cover it completely with a maximized window and leave it for ten minutes. Listen the whole time.
- **Expect**: not one crackle, dropout, or stutter, and no lever is ever applied.
- **Observe**: Task Manager Processes tab — the Efficiency mode leaf never appears on the player.
  Details tab — `Power throttling` stays `Disabled`, base priority unchanged. Activity panel shows the
  player as exempt, with the reason naming audio.
- **Fails if**: any audible artifact, or any lever appears even without an audible artifact.

### 1.2 Music from a tab in a covered browser window

- **Setup**: YouTube or a web player in one tab of a browser window; other tabs open.
- **Do**: cover the browser window completely for ten minutes.
- **Expect**: the audio keeps playing cleanly.
- **Observe**: Details tab, sorted by name, with the browser's child processes grouped. The renderer
  process for the playing tab is the one holding steady CPU. Neither it nor the browser's main process
  may be throttled. Exempting only the parent process is a real and easy bug: the audio is produced by
  a child.
- **Fails if**: the leaf appears on any browser process while a tab is producing sound.

### 1.3 A call in a background window

- **Setup**: a Discord or Teams call with a second person, camera off.
- **Do**: cover the call window completely and hold a conversation for five minutes. Ask the other
  party — explicitly — whether your voice chopped, robotised, or dropped.
- **Expect**: they noticed nothing.
- **Observe**: Efficiency mode column stays clear for the call app **and all of its child processes**.
  Details tab CPU for the call process does not fall off a cliff when the window is covered.
- **Fails if**: the other party reports any artifact, however brief.

### 1.4 A call with screen share, covered

- **Do**: repeat 1.3 with a screen share running and the call window covered by the shared window.
- **Expect**: the share stays smooth at the far end; the frame rate does not visibly drop.
- **Observe**: as 1.3, plus the encoder's CPU in the Details tab.

### 1.5 The audio stack is never a target

- **Do**: with several apps napped, check the Windows audio processes.
- **Expect**: `audiodg.exe` and the Windows Audio service are untouched — not merely un-napped, but
  never opened as candidates.
- **Observe**: Details tab `Power throttling` and base priority for `audiodg.exe` equal the values in
  the pre-run baseline. The PowerShell diff shows no change for them.
- **Fails if**: anything in the audio stack differs from baseline. Throttling `audiodg.exe` degrades
  every sound on the machine at once, so this is a hard fail regardless of what it sounds like.

### 1.6 Media controls reach a napped app

- **Setup**: a media app napped by the governor.
- **Do**: press play/pause on the keyboard's media keys, then use the topbar's media controls.
- **Expect**: the app responds as fast as it does un-napped; the topbar's now-playing state updates.
- **Observe**: time to first sound, by ear against an un-napped baseline. Activity panel shows the app
  leaving the napping state.

### 1.7 Audio starts while the app is already napped

- **Setup**: a silent media app, covered long enough to nap.
- **Do**: start playback without touching its window — a media key, Spotify Connect from a phone, or a
  scheduled alarm in a calendar app.
- **Expect**: the app un-naps and the first second of audio is not clipped or slurred.
- **Observe**: by ear for the first second; Efficiency mode column clears within a second of the
  playback starting. This is the nastiest case in the section: playback begins with no window event at
  all, so a governor that only watches windows will never notice.

## 2. Background throughput

Occluded is not idle. Everything here runs behind other windows and must not slow down.

### 2.1 A large download in a covered browser window

- **Setup**: a file of at least 5 GB from a source that can saturate the link twice in a row.
- **Do**: download it once with the browser window visible and time it. Download it again with the
  window fully covered and time that.
- **Expect**: the covered run is within 5% of the visible run.
- **Observe**: throughput in Task Manager's Performance tab. In System Informer, the downloading
  process's **I/O priority stays Normal** — never Very Low.
- **Fails if**: the covered run is slower by more than 5%, or I/O priority moved at all.

### 2.2 A download from a non-browser client

- **Do**: repeat 2.1 with `curl` or a download manager in a covered terminal window.
- **Expect**: same result. A console window that has been sitting still is a prime false-nap candidate.

### 2.3 A long compile behind other windows

- **Setup**: a clean build that takes at least five minutes — a large C++ or Rust project, or this
  repo's `bun run build` on a cold cache.
- **Do**: time it visible, then time it fully covered.
- **Expect**: within 5%.
- **Observe**: Details tab CPU during the covered run; the compiler's base priority and I/O priority in
  System Informer, unchanged throughout.
- **Note**: run this one on the hybrid-CPU machine. If EcoQoS is being applied here, this is where a
  homogeneous CPU hides it and a hybrid one exposes it.

### 2.4 No background-mode side effects

- **Do**: with as many processes napped as you can arrange, walk the napped list in System Informer.
- **Expect**: **I/O priority and page priority are untouched on every napped process.** Only CPU-side
  levers are in scope. A lever that drops I/O priority turns a background download into a trickle and a
  compile into a crawl, and the symptom looks like a slow disk rather than a governor bug.
- **Observe**: System Informer, process properties, General tab.

### 2.5 A virtual machine in the background

- **Setup**: a running VM — VirtualBox, VMware, Hyper-V, or a WSL2 distro (`vmmem` / `vmmemWSL`).
- **Do**: start something long-running inside the guest, cover the VM window, and wait.
- **Expect**: the guest keeps full speed; the guest clock does not drift.
- **Observe**: guest-side timing versus a visible-window baseline; host-side CPU in the Details tab.

## 3. Wake latency

The governor's whole cost lands here. Measure it, do not eyeball it, and write both numbers in the log.

### 3.1 Baseline: alt-tab into an un-napped app

- **Setup**: governor levers disabled, or an app known not to be napped. Use a heavyweight app — an IDE
  or a photo editor — not Notepad.
- **Do**: alt-tab into it ten times, recording the screen at 60 fps or higher.
- **Expect**: nothing; this is the reference.
- **Observe**: count frames from keystroke to first painted frame. Record the median and the worst.

### 3.2 Alt-tab into a napped app

- **Do**: nap the same app, then repeat 3.1 exactly.
- **Expect**: **added median latency at or under 50 ms, worst case at or under 120 ms**, and no visible
  hitch — no white frame, no stale content, no delayed cursor.
- **Observe**: same frame count, compared against 3.1 on the same machine in the same session.
- **Fails if**: either budget is exceeded, or a tester who does not know which app is napped can tell
  which one is.
- Record both numbers in the pass log even when it passes. This is the item most likely to regress
  quietly over a phase.

### 3.3 Wake through the launcher

- **Do**: open the launcher and pick the napped app from it, ten times.
- **Expect**: the same budget as 3.2. The launcher path activates a window differently from alt-tab, so
  a fix that un-naps on alt-tab can leave this path cold.

### 3.4 Wake through the topbar restore path

- **Setup**: an app minimized to the topbar and then napped.
- **Do**: restore it from the topbar, ten times.
- **Expect**: the same budget as 3.2, and the window returns to its parked position and size correctly.
- **Observe**: frame count as above, plus the restored geometry — a lever released mid-restore can land
  the window in the parking position.

### 3.5 Waking an app whose working set was trimmed

- **Setup**: a memory-heavy app (an IDE with a large solution open, a photo editor with a large image)
  napped long enough to be trimmed.
- **Do**: wake it while `Get-Counter '\Memory\Page Reads/sec'` runs.
- **Expect**: the window still paints inside the 3.2 budget. Record the height and duration of the page
  read spike.
- **Observe**: the counter, plus the app's `Working Set - Private` recovering afterwards.
- **Fails if**: the wake stalls on paging, or the machine's disk pegs for more than a second or two.

### 3.6 Rapid alt-tab cycling does not thrash

- **Do**: cycle through ten windows repeatedly for a full minute.
- **Expect**: no window is napped and un-napped over and over; the governor's own cost stays negligible.
- **Observe**: `alpine-shell.exe` CPU in the Details tab across the minute, against its idle baseline.
  The Activity panel should not flicker between states.

### 3.7 Un-nap restores exactly what nap changed

- **Do**: PowerShell snapshot before napping an app, nap it, wake it, snapshot again, and diff.
- **Expect**: **zero differences.** Priority class, EcoQoS, and suspend state all return to what they
  were, not to what the governor assumes the default is.
- **Observe**: the `Compare-Object` diff, plus System Informer for I/O and page priority.
- **Fails if**: anything differs. An incomplete restore means an app degrades a little on every cycle,
  which is invisible in a five-minute test and obvious after a working day.

## 4. Multi-monitor, mixed DPI, mixed refresh

Occlusion is computed per monitor, in that monitor's own coordinates. Almost every bug in this section
looks like a window napping while part of it is plainly visible.

### 4.1 Covered on one monitor, visible on another

- **Setup**: two monitors at different scaling — 100% and 150%. The same app open on both.
- **Do**: cover the copy on monitor A completely; leave the copy on monitor B fully visible.
- **Expect**: only the copy on A naps.
- **Observe**: Details tab per PID; the Activity panel's per-window state.

### 4.2 A partially visible window on the scaled monitor

- **Do**: on the 150% monitor, cover a window so a strip of it — 50 to 100 physical pixels — remains
  visible. Repeat with the strip on each edge.
- **Expect**: it is **not** Occluded and never naps.
- **Observe**: Activity panel classification, plus the Efficiency mode column.
- **Fails if**: it naps. That is a coordinate-space bug — virtual desktop coordinates being compared
  against per-monitor physical ones — and it will get worse as the scaling factor rises.

### 4.3 A window straddling two monitors

- **Do**: place a window across the boundary between the two monitors and cover only the half on one of
  them.
- **Expect**: not Occluded; the window is still visible.

### 4.4 Mixed refresh rates

- **Setup**: a 60 Hz monitor and a 120 Hz or faster monitor.
- **Do**: run 3.2's measurement for a window on the fast panel.
- **Expect**: the same budget. The governor's polling must not quantise wake work to the slower panel's
  cadence — a 60 Hz-shaped tick costs 16 ms of the budget for nothing.

### 4.5 Uncovering un-naps promptly

- **Do**: drag the covering window aside, so the napped window becomes visible without being focused.
- **Expect**: it un-naps within one tick and repaints normally; a video or animation inside it resumes
  at full rate.

### 4.6 A monitor disappears

- **Do**: with a napped window on the secondary monitor, unplug it (or switch it off, or undock).
- **Expect**: Windows moves the window; the governor reclassifies it; nothing is left napped on a
  monitor that no longer exists.
- **Observe**: the PowerShell diff after the topology settles — no orphaned lever.

## 5. Virtual desktops and cloaking

Windows does not hide a window on another virtual desktop, it **cloaks** it. A cloaked window is still
visible to enumeration and still reports a normal size and position, so a governor that only tests
visibility will treat it as fully visible and never nap it — while one that only tests "is it gone"
will treat it as closed.

### 5.1 A window on another virtual desktop naps

- **Do**: `Win`+`Ctrl`+`D` for a new desktop, move an app to it, and switch back.
- **Expect**: the app classifies as Napping, not as closed, unknown, or missing.
- **Observe**: Activity panel state; Efficiency mode leaf appearing on the app.

### 5.2 Switching back un-naps before first paint

- **Do**: switch back to the desktop holding the napped app.
- **Expect**: no blank or stale frame during the desktop-switch animation.
- **Observe**: screen recording of the switch, frame by frame.

### 5.3 Task View does not cause thrash

- **Do**: open Task View and hold it open over the napped apps for thirty seconds, then close it.
- **Expect**: no repeated nap/un-nap cycling driven by thumbnail rendering.
- **Observe**: Activity panel — states should be stable, not flickering.

### 5.4 Minimized and cloaked are distinguished

- **Do**: minimize one app and cloak another (move it to a second desktop).
- **Expect**: both nap, and the Activity panel names the correct reason for each.

### 5.5 Audio still wins on another desktop

- **Do**: play music from an app parked on a second virtual desktop for ten minutes.
- **Expect**: exempt, exactly as in 1.1. Cross-check with section 1 whenever either changes.

## 6. Battery, AC, and the existing battery saver

Alpine already ships a process-throttling lever. `batterySaver.js` calls
`powerThrottling.setEcoQosPreference` when its `throttleProcesses` setting is on, and that path walks
`app.getAppMetrics()` — **it applies EcoQoS to Alpine's own processes, not to anyone else's.** The
governor works on third-party processes. The two therefore act on disjoint sets, and the point of this
section is to prove they still do: neither may clear, overwrite, or re-derive the other's state.

### 6.1 Both levers active at once

- **Setup**: on battery, battery saver active, `throttleProcesses` on, and several third-party apps
  napped by the governor.
- **Expect**: `alpine-shell.exe` processes show `Power throttling: Enabled` from the battery saver; the
  napped apps show whatever the governor's policy says; no process shows a state neither owner claims.
- **Observe**: Details tab with `Power throttling`, sorted by name.

### 6.2 Turning the battery saver's toggle off

- **Do**: from 6.1, turn `throttleProcesses` off in Battery settings.
- **Expect**: Alpine's own processes lose EcoQoS. **Every governor lever on third-party apps survives
  untouched.**
- **Observe**: Details tab before and after, plus the PowerShell diff.
- **Fails if**: a napped app's state changes. That means one owner is clearing the other's levers.

### 6.3 Un-napping while the battery saver is active

- **Do**: from 6.1, focus a napped app so the governor releases it.
- **Expect**: that app's levers clear; **Alpine's own EcoQoS stays on**.
- **Fails if**: Alpine's own processes lose throttling, which means the release path is clearing state
  globally instead of per-process.

### 6.4 The same two operations in the opposite order

- **Do**: repeat 6.2 and 6.3 with the order reversed — release first, then toggle; toggle, then nap a
  fresh app.
- **Expect**: identical end states. Order-dependence here is the classic shape of two owners fighting.

### 6.5 AC transitions with apps napped

- **Do**: snapshot, unplug AC, wait for the policy to settle, plug it back in, snapshot again.
- **Expect**: the on-battery policy applies and then reverses cleanly; every difference in the diff is
  one you can name and justify.
- **Observe**: the PowerShell diff across the whole transition.

### 6.6 The battery saver activating on its own

- **Do**: with apps napped, let the battery drain to the configured threshold (or force activation with
  the override) and then let it deactivate.
- **Expect**: as 6.5. Automatic activation runs a different code path from the manual override.

### 6.7 Windows' own Energy Saver

- **Do**: compare the Efficiency mode column against the pre-run baseline from step 3 of *Before every
  pass*.
- **Expect**: every leaf you attribute to Alpine is one that was not there before Alpine started.
- **Fails if**: no baseline was captured — then this item, and every item that reads the leaf, is
  unverifiable and the pass is void.

## 7. Sleep, hibernate, resume, lock

### 7.1 Sleep and resume

- **Setup**: at least three apps napped, one of them memory-heavy.
- **Do**: sleep the machine, wait a minute, resume.
- **Expect**: no process is left in a state the governor no longer tracks. Each app un-naps normally
  when woken.
- **Observe**: PowerShell snapshot before sleep and after resume; the Activity panel matching reality.

### 7.2 Hibernate and resume

- **Do**: repeat 7.1 with hibernate.
- **Expect**: the same. Hibernate reconstructs processes from disk, so a lever that survives sleep can
  still be lost — or double-applied — here.

### 7.3 Resume into a changed display topology

- **Do**: sleep docked with an external monitor, then resume undocked (or lid-closed to lid-open).
- **Expect**: classification is recomputed against the monitors that actually exist; nothing is left
  napped on a monitor that came back at a different resolution or scale.

### 7.4 Lock and unlock

- **Do**: `Win`+`L` with apps napped and something playing audio, wait two minutes, unlock.
- **Expect**: whatever the epic's policy is for the locked session, it is applied consistently, and
  **no process is left throttled after unlock**. Audio that was playing before the lock is still
  playing after it.

### 7.5 Fast user switching

- **Do**: switch to a second Windows account, use it briefly, switch back.
- **Expect**: the first session's napped apps behave normally on return, and the governor never touched
  a process belonging to the other session.
- **Observe**: Details tab with the `Session ID` column added; the PowerShell diff run inside the
  second account.

### 7.6 Resume applies levers at most once

- **Do**: watch Alpine's log and `alpine-shell.exe` CPU across a resume.
- **Expect**: no burst of repeated lever application, no CPU spike beyond a brief reclassification.
- **Fails if**: the log shows the same lever applied to the same process repeatedly after resume.

## 8. Crash, kill, and reboot recovery

**Windows does not undo any of these levers when the process that set them dies.** A suspended process
stays suspended forever. EcoQoS stays set until something clears it or the process exits. This is the
entire reason the journal exists, and this section is the one to re-run after any change to it.

### 8.1 Kill Alpine's main process

- **Setup**: three apps napped. Write down their PIDs and each lever applied, from the Details tab.
- **Do**: End task on Alpine's main process in Task Manager.
- **Expect, in two parts**: first, the levers are **still applied** after Alpine dies — confirm this,
  because it is the fact that makes the journal necessary. Then relaunch Alpine and every lever clears
  within a few seconds, with the journal left empty.
- **Observe**: Details tab immediately after the kill and again after the relaunch; the journal file on
  disk; the PowerShell diff against the pre-nap snapshot.

### 8.2 Kill the whole process tree

- **Do**: repeat 8.1 with *End process tree*, so every Alpine process dies at once with no chance to run
  a shutdown handler.
- **Expect**: identical recovery.

### 8.3 Kill Alpine while an app is suspended

- **Do**: if suspend is one of the levers, kill Alpine while a target is suspended.
- **Expect**: after relaunch the app is resumed **and usable** — click into it, type, resize. Not merely
  reported as resumed by a tool.
- **Fails if**: the user is left with a frozen window and no way to fix it short of killing their app.
  This is the worst outcome in the matrix; treat any failure here as release-blocking.

### 8.4 Reboot with a dirty journal

- **Do**: kill Alpine with apps napped, and **do not relaunch it**. Reboot. Take a PowerShell snapshot,
  then launch Alpine, then take another a minute later.
- **Expect**: the journal's entries are recognised as stale and discarded. Nothing outside Alpine
  changed between the two snapshots.
- **Fails if**: any unrelated process's priority or throttling state changed. PIDs are recycled across a
  reboot, so a journal that identifies a target by PID alone will "restore" a stranger — and the victim
  is whatever happened to boot into that number.

### 8.5 A corrupt journal

- **Do**: truncate the journal file mid-record, or replace its contents with garbage, then launch Alpine.
- **Expect**: Alpine starts normally, logs the problem once, and applies nothing.
- **Fails if**: it crashes, loops, or replays partial records.

### 8.6 Killed mid-application

- **Do**: kill Alpine while it is applying levers to a batch of processes — nap several apps at once and
  kill during the burst. Repeat until you catch it mid-batch.
- **Expect**: recovery is clean either way. The journal is written before the lever, so recovery may try
  to clear a lever that was never applied; clearing an unset lever must be harmless.

### 8.7 Clean exit clears everything

- **Do**: with apps napped, exit Alpine normally, including the path that restores `explorer.exe`.
- **Expect**: every lever cleared during shutdown; the journal ends empty; the PowerShell diff against
  the session's opening snapshot is clean.

## 9. Fullscreen games and video

### 9.1 A fullscreen exclusive game

- **Setup**: a game in exclusive fullscreen, which covers every other window including the shell.
- **Do**: play for ten minutes.
- **Expect**: the game is **Interactive**, never Occluded. Covering everything else is what a foreground
  game does; it must never be read as evidence that the game itself is hidden.
- **Observe**: the game's own frame-time counter or PresentMon for stutter; Efficiency mode column never
  shows a leaf on the game.

### 9.2 Borderless fullscreen

- **Do**: repeat 9.1 in borderless windowed mode.
- **Expect**: the same. The window is a normal top-level window here, so it takes a different path.

### 9.3 Alt-tab out of a game and back

- **Do**: alt-tab out to the desktop, wait thirty seconds, alt-tab back. Five times.
- **Expect**: no stutter on return and no lever left applied. Exclusive fullscreen may minimize or cloak
  the game on focus loss, which pushes it straight into a napping classification.

### 9.4 Overlays taking focus

- **Do**: open the Xbox Game Bar and a Discord overlay over a running game.
- **Expect**: the game does not nap while an overlay holds focus in front of it.

### 9.5 Fullscreen video

- **Do**: play fullscreen video for ten minutes — VLC and a browser, both.
- **Expect**: Interactive; no dropped frames.
- **Observe**: the browser's stats-for-nerds dropped-frame counter, or VLC's statistics pane.

### 9.6 Video playing in a covered window

- **Do**: play video in a window on one monitor and work in a covering window on the other.
- **Expect**: playback continues at full frame rate with clean audio — the same rule as section 1.

### 9.7 Anti-cheat does not object

- **Setup**: a competitive title with kernel anti-cheat.
- **Do**: play a full match with the governor running.
- **Expect**: no kick, no ban warning, no anti-cheat error dialog, and no failure to launch.
- **Observe**: the game's own messaging and the anti-cheat's log if it has one. A denied `OpenProcess`
  against a protected game is normal and expected; being *seen trying* is the risk this item covers.

## 10. Elevated, protected, and system processes

### 10.1 An elevated window degrades silently

- **Setup**: an elevated app — an elevated PowerShell, RegEdit, or Task Manager itself — covered so the
  governor would ordinarily nap it. Alpine running unelevated.
- **Do**: leave it covered for ten minutes with Alpine's log open.
- **Expect**: `OpenProcess` fails with access denied and the governor gives up on that process. **At
  most one log line about it, ever.** No retry loop, no per-tick line.
- **Observe**: count the matching log lines over the ten minutes; watch `alpine-shell.exe` CPU stay at
  its idle baseline in the Details tab.
- **Fails if**: the log grows steadily, or Alpine's CPU rises while an unmanageable window is covered.

### 10.2 The panel does not lie about it

- **Do**: look at the Activity panel entry for the app from 10.1.
- **Expect**: it is shown as unmanageable, with a reason, rather than reported as napping.
- **Fails if**: the panel claims a lever that was never applied.

### 10.3 Protected processes

- **Do**: repeat 10.1 against `MsMpEng.exe` and any anti-malware or anti-cheat service on the machine.
- **Expect**: the same silent degrade.

### 10.4 System-critical processes are never candidates

- **Do**: with the machine busy and many apps napped, check `csrss.exe`, `winlogon.exe`, `lsass.exe`,
  `dwm.exe`, `audiodg.exe`, and `explorer.exe`.
- **Expect**: unchanged from baseline, and never opened as candidates in the first place.
- **Observe**: the PowerShell diff, restricted to those names.

### 10.5 Alpine never naps itself

- **Do**: check every `alpine-shell.exe` process while other apps are napped.
- **Expect**: the governor applies nothing to Alpine's own processes. Their throttling state is owned by
  the battery saver alone — see section 6.

### 10.6 Alpine running elevated

- **Do**: run Alpine elevated and repeat 10.1. An elevated Alpine *can* open elevated targets.
- **Expect**: the same policy decisions as unelevated. Nothing that was exempt for policy reasons
  becomes a target just because the handle now opens.

### 10.7 A process that exits while napped

- **Do**: close a napped app from the taskbar, or kill it from Task Manager, while its levers are applied.
- **Expect**: no error spam, the journal entry is dropped, and no lever is later applied to whatever
  process inherits that PID.
- **Observe**: Alpine's log at the moment of exit; the journal file afterwards.

## 11. Soak

### 11.1 A full working day

- **Do**: use the machine normally for eight hours with the governor enabled. Snapshot in the morning
  and at the end.
- **Expect**: no app left throttled at the end of the day. Alpine's handle and thread counts are flat.
  The journal has not grown without bound.
- **Observe**: the PowerShell diff across the day; System Informer's handle and thread counts for
  `alpine-shell.exe`, morning versus evening; the journal file's size.

### 11.2 A hundred nap and wake cycles

- **Do**: cycle one app between covered and focused a hundred times.
- **Expect**: no drift. The app's final state matches its opening snapshot exactly, as in 3.7, and the
  wake latency of the hundredth cycle matches the first.

## After a pass

Leave the machine clean. Exit Alpine normally, confirm the journal is empty and the PowerShell diff
against the pre-run baseline is clean, then reboot. Any lever still applied after that reboot is a
finding in its own right — record it against 8.7 whatever else you were testing at the time.

## Recording a pass

A pass is a run of this matrix against one build on one machine. Record it below. Every item gets a
result: **PASS**, **FAIL**, or **SKIP** — and a FAIL or SKIP must name the item number, the reason, and
the issue number if one was opened. An item with no hardware to run it on is a SKIP, not a PASS.

Copy this block into the log for each pass:

```
Pass N — YYYY-MM-DD
Build:      <short sha or installer version>
Windows:    <winver build>
Hardware:   <cpu (note hybrid or not), ram, gpu, battery yes/no>
Monitors:   <count, each with resolution, scale, refresh>
Tester:     <name>
Baseline:   <captured / not captured>

Results:    <n> pass, <n> fail, <n> skip
3.2 wake latency: median +<n> ms, worst +<n> ms (baseline median <n> ms)
Failures:   <item number — what happened — issue link>
Skips:      <item number — why>
Notes:      <anything the next tester needs to know>
```

Governor stories cite items from this matrix in their acceptance criteria, and at least one full pass
must be recorded here before the first lever story is called done.

### Pass log

_No pass recorded yet._
