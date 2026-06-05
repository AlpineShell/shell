# Alpine Shell — Release Readiness & Performance Plan

Alpine Shell is a commercial Windows desktop **shell replacement** (Electron / React / koffi) that rewrites `Winlogon\Shell` to replace `explorer.exe`. This document answers two founder questions: (1) what is still needed to **release and sell** it, and (2) how it can credibly make Windows **faster / more performant** as product features. It is the synthesis of a multi-agent deep-research pass over the actual repository.

> **Scope note.** Dated **2026-06-05**. This plan deliberately **excludes building a marketing website** (the founder already knows that is needed) but **does** cover the operational selling infrastructure: code signing, licensing/entitlement, payments/tax, legal documents, support/diagnostics, crash-safety, QA, and the performance features themselves. This is research, not legal advice — the legal sections must be reviewed by a lawyer before charging money.

---

## TL;DR

- **What's already done (the hard plumbing exists):** an **NSIS auto-updating installer**, **electron-updater + Cloudflare R2** publishing, a **GitHub Actions `release.yml`** pipeline, and a real **shell-replacement lifecycle** with a symmetric uninstall/revert path (`--uninstall-cleanup` restores `Shell=explorer.exe` and `AutoRestartShell=1`). The modern Electron security baseline is also partly in place (`contextIsolation: true`, `nodeIntegration: false` on all five windows).
- **You cannot legally charge a dollar today.** There is **no licensing/entitlement/paywall**, **no Merchant-of-Record checkout**, and **no EULA / privacy policy / refund-withdrawal policy** anywhere in the repo (the only LICENSE files are inside `node_modules`).
- **The build is unsigned, and signing is harder for *this* founder than it looks.** Every artifact ships unsigned today. The recommended fix (Azure Artifact/Trusted Signing, ~$10/mo) **may not be available to a Swiss individual** — Microsoft's eligibility list covers EU/UK orgs and US/CA individuals, and Switzerland is not enumerated. This is a **multi-week identity/entity long pole**, not a quick task (see the conflict note in Part A).
- **A single crash or a Windows feature update can black-screen a paying customer.** `AutoRestartShell=0` is set and `Winlogon\Shell` points directly at the Electron exe, with **no watchdog**, no auto-fallback to `explorer.exe`, and no crash reporting. The desktop-lockout chain is open end-to-end.
- **Two bundled assets are an undisputable copyright blocker:** the **"Moga White" cursor** (DeviantArt "Free Version," default CC BY-NC-ND, no license file) and **three wallpapers** with undocumented provenance. Cheap to fix; no excuse to ship unresolved.
- **The performance features are real but modest.** Boot/debloat/snappy-mode gains are *seconds, not magic* on SSDs, and several popular "tuning" tweaks are placebo or harmful. The differentiator is **honesty + measured before/after + full reversibility**, not big numbers — and over-promising "faster PC" invites the same FTC enforcement that cost Restoro/Reimage **$26M** and got Paddle **permanently banned** from processing for performance-marketing merchants.

---

## Master Roadmap (prioritized)

This is the centerpiece: every `actionItem` from the 14 findings and every `missingItem` from the 2 critics, de-duplicated and bucketed by priority. Pillar = `release` or `perf`. Effort = S/M/L.

### Phase 0 — Blockers before charging a single dollar

| Item | Pillar | Effort | Why it matters (1 line) |
|---|---|---|---|
| Stand up code signing (Azure Artifact Signing *if eligible*, else an EU entity or token/cloud-HSM OV cert) and submit identity validation **now** | release | M | Unsigned Winlogon-shell binary is blocked by Smart App Control, flagged by SmartScreen/Defender, and unsellable; validation is the long pole |
| Wire `win.azureSignOptions` (or signtool/OV) + RFC-3161 timestamp (`http://timestamp.acs.microsoft.com`, SHA256) into `package.json` and `release.yml`; sign installer **and** inner exe(s) | release | M | Trusted-Signing certs live ~72h; without a timestamp every install breaks in 3 days |
| Set a stable `win.publisherName` = cert CN, identical across releases | release | S | electron-updater verifies update installers by CN; reputation only compounds on a fixed identity |
| Ship a tiny native **watchdog/launcher**; register `Winlogon\Shell` to *it*, supervise Alpine as a child with crash-loop backoff | release | L | One main-process crash currently leaves a black screen with no recovery |
| Auto-fall back to `explorer.exe` + "Windows restored — retry Alpine?" dialog on crash-loop | release | M | A paying user must never be permanently stranded |
| **Stop setting `AutoRestartShell=0`** (leave Windows default `1`) | release | S | Removing Windows' own respawn safety net is reckless for a paid shell |
| Register a global recovery hotkey (e.g. `Ctrl+Alt+Shift+R`) inside the watchdog that spawns explorer + reverts Shell | release | M | Must work even when Alpine's process is dead |
| Handle Windows **feature-update Shell reset**: self-heal that does NOT depend on Alpine launching (Run-key sentinel + post-update recovery prompt) | release | M | `ensureShellRegistration()` only runs if Alpine starts; a feature update can reset Shell so it never does |
| Remove Base64 `-EncodedCommand` + `-ExecutionPolicy Bypass` + `RunAs` elevation (`appManager.js:521`, `windowsUpdate.js:253`); replace with a signed elevation-helper exe or plain args | release | M | Highest-signal, fully-fixable living-off-the-land / PUA trigger |
| Set up a Merchant-of-Record (Lemon Squeezy primary, Polar.sh alt) and complete KYC; confirm Switzerland payout + CHF/EUR currency | release | S | MoR becomes legal seller and absorbs CH/EU/UK/US VAT, refunds, chargebacks |
| Do **NOT** go Stripe-direct + Stripe Tax | release | S | A Swiss digital seller hits Switzerland's CHF-0 B2C threshold and stays personally liable in 175+ jurisdictions |
| Build the entitlement/paywall (MoR keys for v1, or Keygen Ed25519) — a **failed/lapsed/offline check degrades to a nag, NEVER to a no-desktop state** | release | L | This is the literal missing paywall; a license bug must not brick the login |
| Define safe-degrade **revocation/refund** behavior + 14–30 day offline grace + grandfather rule for lapsed-updates users | release | M | A revoked/refunded license must never lock a user out of their desktop |
| Draft EULA ("AS IS", liability cap at fees paid, indirect-damage exclusion naming lost data/business interruption) | release | M | Caps exposure for the shell-lockout failure mode |
| Add the custom **shell-restoration / recovery disclaimer** (the clause no template has) with literal `explorer.exe` recovery steps | release | S | Informed consent is the strongest defense if a desktop breaks |
| Implement the EU/UK **CRD Art. 16(m)** withdrawal waiver (non-pre-ticked checkbox + acknowledgement + durable-medium email) | release | S | Without it, EU/UK buyers keep a 14-day refund right after download |
| Publish a **GDPR + Swiss FADP privacy policy** before any license activation / crash reporting / telemetry phones home | release | M | The obligation triggers the first time the app phones home |
| Remove the **"Moga White" cursor**; replace with commission/Bibata-GPL/CC0/self-authored + commit license proof | release | M | Default DeviantArt CC BY-NC-ND forbids commercial resale; no license file ships |
| Identify and replace the **three wallpapers** with documented CC0/commissioned images | release | M | Provenance is undocumented; that is itself the compliance defect |
| Add `setWindowOpenHandler(deny)` + `will-navigate` allowlist + deny `will-attach-webview` in `main.js` | release | S | Closes navigation/tab-jacking vectors on a command-executing shell |
| Validate IPC senders (`event.senderFrame`) and arg-validate `run/exec`, `launch-admin`; restrict `shell.openExternal` to http/https/ms-settings | release | M | The IPC boundary is the only thing between web content and arbitrary command execution |
| Inject a Content-Security-Policy via `onHeadersReceived` (`script-src 'self'`) | release | S | Backstop that neuters XSS even if a string is mis-rendered |
| Run the **install → set-as-shell → reboot → uninstall → reboot → Explorer-returns** safety test on Win11 24H2 | release | M | The test that protects you from the worst possible support ticket |
| Set a **hard claim ceiling**: forbid generic "faster PC / X% faster" marketing | release | S | FTC requires substantiation held *before* the claim is made |
| Permanently exclude all snake-oil features (registry cleaner, RAM booster, internet accelerator, SSD defrag, "N problems found" scan) | release | S | These trigger both FTC deception and Defender PUA classification |
| Audit all UI/marketing strings against Microsoft's PUA "lack of choice" criteria (neutral facts, not alarming verdicts) | release | S | An "errors detected → pay to fix" UI pushes Alpine toward Defender PUA block-mode |

### Phase 1 — Launch-quality (high)

| Item | Pillar | Effort | Why it matters (1 line) |
|---|---|---|---|
| Integrate `@sentry/electron` (v6) in main + every renderer, plus Crashpad, on the free Developer plan | release | M | You are currently blind to the black-screen failure that drives refunds |
| Make the watchdog cover the **update gap** (hold-screen window or temporary explorer); prefer deferred install on user restart over mid-session `quitAndInstall` | release | M | Eliminates the black-screen window during NSIS install |
| Treat "Alpine exited and didn't return within T seconds" as a crash → relaunch installed exe; verify post-update launch | release | M | Guards against failed `quitAndInstall` stranding the user |
| Implement license offline grace (14–30d) + 7-day revalidation, piggybacking the existing 6-hour updater timer | release | M | Avoids bricking a paying customer who is offline / on a plane |
| Add license/activation UI to the setup window + `useLicense` hook | release | M | Surfaces the paywall without a no-desktop failure mode |
| Subscribe to MoR purchase/refund/subscription webhooks to grant/revoke access | release | M | Refunds, chargebacks, cancellations must revoke entitlement |
| Gate auto-updates on `claims.updatesUntil`; feature-gate on `claims.entitlements` | release | M | Lapsed-updates users keep their version; free vs paid from one binary |
| Write the license grant to match the entitlement model (per-user, non-transferable, termination on lapse) | release | M | Contract and code must agree |
| Lawyer review of the three things templates get wrong (liability cap + shell-lockout disclaimer, EU/UK B2C unfairness test, license grant) | release | S | Caps hold for ordinary bugs but not bad faith; verify they survive |
| Surface the lockout-risk disclaimer at sales page + first-run window + FAQ | release | S | Strengthens the "warned and given a remedy" defense |
| Write a clear refund policy (e.g. 14-day money-back) + EU right-of-withdrawal waiver copy | release | S | Required for consumer law; reduces chargebacks |
| Ship `LICENSES.chromium.html` + Electron `LICENSE` in-app via `extraResources`; generate `THIRD-PARTY-LICENSES.txt` in the release script | release | S | Mandatory to distribute an Electron app commercially |
| Add the three FFmpeg LGPL-2.1 notices (buy page, About box, EULA) + link to matching FFmpeg source | release | S | LGPL relink obligation |
| Add an `afterPack` hook swapping the proprietary `ffmpeg.dll` for Electron's patent-free build | release | M | Drops unused H.264/AAC/MP3 and the MPEG-LA patent exposure |
| Add `asarUnpack` for koffi / native `.node` binaries | release | S | Temp-extracted native modules are a known AV trojan-flag trigger |
| Pre-submit each release to VirusTotal; enroll in its developer allowlist once signed | release | S | Baseline detection ratio and catch flags before launch |
| Build a per-vendor false-positive runbook (WDSI portal + Avast/Norton/McAfee/Bitdefender/ESET) | release | M | The Winlogon rewrite is an inherent heuristic magnet; expect flags |
| Enable Electron fuses + ASAR integrity (`onlyLoadAppFromAsar`, integrity validation, `runAsNode:false`, etc.); verify packaged `file://` still boots | release | M | Stops `app.asar` tampering / license bypass (only has teeth once signed) |
| Set `sandbox: true` explicitly on all five windows; deny all session permission requests; add `eslint-plugin-security` + `tsc --noEmit` to CI | release | S | Make the security posture explicit and audit-friendly |
| Build the **local measurement layer**: boot time from Event ID 100 (median of N), idle RAM/CPU sampler, startup-item & process/service counts, persisted baseline | perf | L | The product *and* the FTC/PUA legal shield |
| Ship the in-app **"What we changed and measured"** report (before/after + "what we did NOT change" + caveats + Revert + Export) | perf | M | Proof, not promise; the anti-snake-oil hero feature |
| **Kill all per-tick `powershell.exe` spawns**; route polls through one shared persistent PS host | perf | L | Removes ~40k process launches/day; biggest idle-CPU/stability win |
| Convert battery/network/openApps/volume from polling to Windows event subscriptions | perf | L | Removes ~4 of ~10 idle loops |
| Suspend all polling + cursor tracker while session locked / display off | perf | M | A locked machine should do ~zero work |
| Settings/profile **backup, export & import** (versioned JSON: layout, tray order, wallpaper, tiling, undo journals) + auto-backup on update | release | high | Reinstall/reimage/new-PC currently silently loses everything the customer set up |
| Store revert/undo journals somewhere **uninstall/reinstall-safe** (ProgramData + export), not only `userData` | release | M | A `userData` wipe currently strips the ability to revert system changes |
| In-app **"Generate support report"** diagnostics bundle (logs, Shell value, display topology, license state, redacted env) | release | high | A registry-modifying FFI/PowerShell shell will generate tickets; don't debug blind |
| Support channel + **externally-hosted recovery/status page** + published changelog | release | high | The recovery remedy must be reachable when the app itself is down |
| Beta/staged-rollout update channel (`stagingPercentage` 10→50→100) + strict semver + in-app changelog before applying | release | high | One bad login-critical release otherwise hits 100% of paying users at once |
| Standby/sleep/resume, lock/unlock, RDP, fast-user-switching robustness (re-establish FFI handles, restart PS host, re-arm hooks on resume) | perf | high | Stale handles after resume freeze the topbar with no taskbar fallback |
| Halve renderer count (collapse desktop+topbar per display; lazy-create desktop when no wallpaper) | perf | L | Electron cannot merge same-origin windows; reduce window count instead |
| Drive `foregroundColor` off the existing `EVENT_SYSTEM_FOREGROUND` hook; raise cursor tracker 50→100-120ms | perf | M | Removes a 300ms poll and halves cursor wakeups |
| Add staggered/delayed launch to `processAutostart()` (Alpine is the shell, so no Task Scheduler/elevation needed) | perf | M | Highest-impact, fully reversible, no-elevation boot win |
| Build the boot-time reader (Event 100 + 101-110 offenders) and the `bootOptimizer.js` "Speed up startup" page | perf | M/L | Makes the startup feature credible with a real before/after number |
| Snapshot original values before any Snappy-Mode write; build `performanceMode.js` (Tier-1 animation/MenuShowDelay/transparency tweaks via `SystemParametersInfoW`) | perf | M | Highest-ROI perceived-speed win, fully reversible |
| Add a "reduced motion" path in Alpine's own React UI (<100ms transitions) | perf | M | The win the user actually feels, since Alpine replaces most Win32 chrome |
| Engineering-as-legal-mitigation: watchdog/auto-revert that restores `Shell=explorer.exe` if Alpine fails to start | release | M | Prevents the harm the disclaimers try to limit |

### Phase 2 — Post-launch hardening (medium)

| Item | Pillar | Effort | Why it matters (1 line) |
|---|---|---|---|
| Build the data-driven `debloat.js` engine (per-op `detect/apply/undo/risk/supportedEditions`) with a central **denylist guard** (never Defender/Update/Store/WebView2/runtimes) | release | L | A debloater that touches security/update infra is malware-adjacent |
| Default Appx removal to per-user `Remove-AppxPackage` only (no `-AllUsers`, no provisioned, no bulk pipe) + undo manifest + "Restore Windows apps" | release | M | Keeps removals reversible and inside the asInvoker model |
| Build the allowlist-only service-trim feature (SysMain/DoSvc/Spooler/Fax/bthserv/Xbox; Manual first) behind one elevation prompt | perf | L | HKLM start-type edits need admin; "Manual" ≠ "Disabled" |
| Create a System Restore point before any HKLM change (handle 24h throttle); Alpine change journal for undo when Restore is off | release | M | Belt-and-suspenders reversibility |
| Build `tuning.js` Tier-1 user-scope toggles (power-mode overlay, Game Mode, foreground priority capped at High) | perf | M | The few defensible runtime wins |
| Decide & document the elevation strategy (just-in-time UAC for machine-scope, or drop those knobs) | perf | S | Non-elevated SysMain/power-plan writes silently fail |
| Fast Startup toggle with storage-type-aware default (keep ON for SSD) | perf | S | Disabling it makes SSD boot *slower*; frame as reliability, not speed |
| Edition/build detection + honest labels (telemetry `0` floored on Home/Pro; supported removal policy is ENT/EDU 24H2 only) | release | S | Avoid claiming changes that silently don't apply |
| Migrate hot-path system reads from PowerShell to koffi/Win32 (battery, network, brightness state) | perf | L | Cuts both AV spawn-volume signal and per-call latency |
| Targeted `broadcast()` (topbar-only events don't wake desktop renderers) | perf | S | Avoids waking every renderer on every IPC message |
| Startup flags: `Menu.setApplicationMenu(null)`, `spellcheck:false`, `backgroundThrottling` on collapsed/desktop windows, audit GPU process | perf | S | Sheds unused subsystems |
| Lazy-load heavy modules; set `asar:true` explicitly; bundle main/preload with esbuild | perf | M | Cuts require-graph cost at the login critical path |
| Pre-create + hide launcher/flyout windows; `backgroundThrottling:false` for them; extend optimistic-update pattern to every control | perf | M | Keeps perceived feedback under 100ms |
| Settings UI: master Snappy toggle + Advanced Tier-2 disclosure (VisualFXSetting=2, DragFullWindows, modest Hung/WaitToKill timeouts) with before/after | perf | M | Honest, opt-in tradeoffs |
| Playwright `_electron` smoke test on the packaged build in `release.yml` | release | M | Catches ~70% of "won't even boot" regressions |
| Post-build assertion: fuses flipped + ASAR integrity resource present | release | S | A build-config regression fails the release instead of shipping |
| Per-release **performance regression gate** in CI (idle working-set + idle CPU + process counts vs documented budget) | perf | M | Otherwise "lighter than explorer.exe" silently regresses |
| Idle/battery efficiency as a measured release gate (Modern-Standby/DRIPS residency; battery-aware cursor/foreground polls) | perf | M | 24/7 polling on laptops is a refund/review-killer |
| Manual hardware matrix: mixed-DPI multi-monitor, hotplug/dock/RDP, DDC/CI-disabled monitor degrades gracefully | release | L | A shell's blast radius is "can't reach desktop" |
| Manual matrix: non-admin standard user full flow + non-English locale (PowerShell parsing) | release | M | Per-user install is the primary target; localized output silently breaks parsing |
| i18n framework (English-first, externalized strings) + locale-robust system parsing (invariant Win32/WMI numeric fields) | release | M | Retrofitting i18n later is costly; localized parsing breaks status for non-English buyers |
| Accessibility: keyboard-operable flyouts/launcher/tray/settings + visible focus + ARIA; documented EAA-scope determination | release | M | Replaces accessible OS chrome; EAA enforceable since 28 Jun 2025 |
| Clean-uninstall completeness audit (restore prior cursor scheme, re-enable StartupAppTask, remove orphaned state, AutoRestartShell=1) | release | M | "It left junk behind" is a direct trust/refund driver |
| Drift-detect + "offer re-apply" for debloat (feature updates re-enable DiagTrack/apps) — do NOT silently re-run on boot | perf | M | Don't fight the OS on every boot |
| Calendar the 2-year Trusted-Signing re-validation + 24-month client-secret expiry | release | S | So signing doesn't silently break a future release |
| Add `app.requestSingleInstanceLock` + watchdog heartbeat (named pipe) to detect a *hung* Alpine | release | M | Detect/restart a hung (not just crashed) shell without racing two instances |
| Add a local rolling log (Alpine + watchdog) + a named "Alpine Recovery" Start-Menu/Desktop shortcut + README escape docs | release | S | Offline diagnosis + a lifeline for non-technical users |
| Establish a Process Explorer measurement harness + 24-48h leak/working-set drift check | perf | S | Make every footprint claim real |
| Set documented idle targets as a release gate (≤200MB single / ≤300MB dual, <0.5-1% idle CPU, must beat explorer.exe) | release | S | Turns "lighter than explorer" into a verified gate |
| Fix the inconsistent shell-recovery state detection (`setup.js:169` exact-match vs `.includes` at 140/145) | release | S | Off-by-one can misreport whether explorer was restored |

### Nice-to-have (low)

| Item | Pillar | Effort | Why it matters (1 line) |
|---|---|---|---|
| Surface optional per-task disabling of vendor logon scheduled tasks (allowlisted) | perf | M | Small, surgical boot win |
| Advanced "export deep boot trace" doc (xbootmgr / WPA FullBoot) without bundling binaries | perf | S | Power-user diagnostics |
| Support `publisherName` as an array if you ever migrate signing identity | release | S | Avoids bricking auto-update for existing installs |
| Plan the Keygen Cloud → Keygen CE self-host migration once near the paid-tier threshold | release | L | Later cost optimization, same SDK |
| In-app "Open Source Licenses" / attribution view | release | S | Surfaces the NOTICE and ASSETS-LICENSES to users |
| Gracefully handle non-removable AI/system packages (Copilot, Event ID 874) | release | S | Apply step never appears to silently fail |
| Add a recurring license-checker scan to catch GPL/AGPL creep in transitive deps | release | S | Prevents a future forced source-disclosure |
| Verify `DragFullWindows=off` doesn't break the new live-drag zone-snapping overlay | perf | S | Outline-only dragging must still report positions |
| Explicitly decide NOT to invest in JS obfuscation / V8-bytecode vaults; document the threat model | release | S | Effort belongs on server-side controls, not deobfuscatable client tricks |
| Evaluate a V8 snapshot for the main process *after* Tier 1-2 footprint work | perf | L | Cuts login-to-usable time; brittle across Electron upgrades |
| Document the structural Chromium-renderer ceiling; plan a native Win32/WinUI topbar as the escape hatch | perf | M | If low-RAM machines still can't beat explorer.exe after consolidation |

---

## Part A — Release & Selling Readiness

### Code Signing & SmartScreen

Alpine is not a normal Electron app from a trust standpoint. The repo writes `HKCU\...\Winlogon\Shell` to replace `explorer.exe`, sets `HKLM ...\Winlogon\AutoRestartShell=0`, adds an `HKCU Run\AlpineShell` autostart entry, disables a scheduled task, and installs a cursor theme. Replacing the Winlogon shell and writing autorun keys is exactly the behavior MITRE ATT&CK catalogues as **Winlogon Helper / Boot-or-Logon Autostart persistence (T1547.004)** that AV engines actively hunt. An **unsigned** binary doing this is a near-perfect signature-match for malware persistence. Today every artifact ships unsigned (NSIS installer, `requestedExecutionLevel: asInvoker`, no `win.azureSignOptions`/`signtoolOptions`). **Signing is a release blocker, not a nice-to-have.**

**The 2024–2026 reality check: EV no longer buys instant SmartScreen trust.** From ~2012 to early 2024 an EV cert granted *instant* positive SmartScreen reputation. That ended: in Feb 2024 Microsoft's Trusted Root Program stopped recognizing EV code signing as a distinct category, SmartScreen stopped granting instant reputation, and the EV code-signing OIDs were removed so all code-signing certs are treated equally. Microsoft's own current docs (SmartScreen reputation page, updated May 2026) state plainly: *"EV certificates no longer bypass SmartScreen… Paying a premium for EV solely to avoid SmartScreen warnings is no longer justified."* The driver was criminals buying/stealing EV certs (Black Basta leaks showed them selling for ~$2,000–$6,000) to bypass SmartScreen. **Consequence: do not pay 2-4x for EV expecting a green-light — that benefit is gone.** EV now only matters for enterprise procurement checkboxes and kernel-mode drivers, neither of which applies.

**How reputation actually accrues now.** SmartScreen weighs **publisher reputation** + **file-hash reputation**. A brand-new signed binary still shows a warning until it accrues clean download evidence; signing lets that climb *carry forward* to future releases signed with the **same identity**. Unsigned files start from zero on every version — devastating for an auto-updating app. Microsoft gives no fixed threshold but says it "can take several weeks and hundreds of clean installs from a wide audience," with no consumer fast-track. **Windows 11 Smart App Control can block unsigned executables outright** until they earn reputation. Sign now, with a stable identity you will not rotate.

**The HSM/token rule.** Since June 1, 2023, the CA/Browser Forum requires the private key for all new code-signing certs (OV and EV) to live on FIPS 140-2 L2 / EAL4+ hardware, non-exportable — so a traditional cert ships as a USB token (painful in CI) or a cloud-HSM add-on. This is why **Azure Trusted Signing (now "Artifact Signing")** is the recommended path for small/CI developers: a managed service with **no token**, ~**$9.99/mo Basic** (5,000 sigs), official GitHub Action + electron-builder support. Certs are extremely short-lived (~3 days), rotated automatically, which makes **RFC-3161 timestamping mandatory**.

> ⚠️ **CONFLICT — eligibility for a Swiss founder.** The code-signing finding recommends Azure Artifact Signing as the cheap, immediate path and says GA opened it to self-employed individuals. **The second critic disputes that this is available to *this* founder.** Per Microsoft's Artifact Signing FAQ (updated 2026-05), Public Trust certs are available to **organizations in the USA, Canada, the EU, and the UK, plus individual developers in the USA and Canada only** — **Switzerland is not in either list.** So a Swiss solo founder must either (a) form/use a Microsoft-validatable EU legal entity, or (b) buy a conventional OV cert from Sectigo/DigiCert/SSL.com (token or cloud-HSM, ~$200–500/yr, with CI friction). **Treat the "~$10/mo, sign up immediately" framing as aspirational and verify your specific country/entity status at signup.** Either way this is a multi-week identity/entity task that gates the entire release and must start now.

**Wiring it into electron-builder.** electron-builder added Azure Trusted Signing support in 26.0.1 (you're on 26.8.1). Add a `win.azureSignOptions` block (it cannot be combined with `signtoolOptions`):

```jsonc
"win": {
  "target": "nsis",
  "requestedExecutionLevel": "asInvoker",
  "publisherName": "Your Verified Name or Org",
  "azureSignOptions": {
    "publisherName": "Your Verified Name or Org",          // must equal the cert CN exactly
    "endpoint": "https://eus.codesigning.azure.net/",
    "codeSigningAccountName": "your-trusted-signing-account",
    "certificateProfileName": "your-public-trust-profile",
    "timestampRfc3161": "http://timestamp.acs.microsoft.com",
    "timestampDigest": "SHA256"
  }
}
```

Correctness points for Alpine: electron-builder signs both the inner `Alpine Shell.exe` and the NSIS installer automatically (which also keeps the `--uninstall-cleanup` relaunch from looking suspicious); **electron-updater (6.3.9) verifies updates by string-comparing the new installer's certificate Common Name against the configured `publisherName`**, so keep it identical across releases and use the array form only when migrating identity. Verify the timestamp in CI with `signtool verify /pa /v` — there is a known electron-builder issue where the Azure TSA timestamp wasn't applied. **Microsoft Store is off the table** for a shell replacement (policy/sandboxing), though it is the only path that never warns.

Honest tradeoffs: signing removes the "unknown publisher" label and shows your verified name immediately, but **does NOT remove the SmartScreen warning on day one** — you still climb the curve for weeks. Set that expectation with early buyers (install-help copy/video), never push unsigned auto-updates, keep the cert clean (never sign anything PUA-like), and register a process to report false positives via Microsoft's WDSI portal.

### Antivirus / Defender / PUA Avoidance

Every behavior here is, individually, a documented malware technique; stacked in one unsigned Electron binary from a non-reputed URL, Alpine looks to a behavioral/ML engine almost exactly like a "shell hijack" trojan. Verified in the repo:

| Behavior | Where | Why AV/EDR cares |
|---|---|---|
| Writes `HKCU\...\Winlogon\Shell` → your exe | `setup.js:88`, `installer.js:60` | Winlogon Shell hijack (T1547.004) — the highest-signal flag |
| `taskkill /f /im explorer.exe` | `setup.js:150` | Classic defense-evasion / shell-replacement behavior |
| Sets `AutoRestartShell=0` (HKLM) | `setup.js:91` | Known anti-recovery trick used by lockers |
| **Base64 `-EncodedCommand` + `Start-Process -Verb RunAs`** | `appManager.js:521`, `windowsUpdate.js:253` | The single most fixable high-signal pattern (T1027.010 + UAC-bypass read) |
| Constant one-shot `powershell -NoProfile -Command` | `powershell.js:5`, dozens of modules | High PowerShell spawn volume is a behavioral score multiplier (T1059.001) |
| `reg add` / `schtasks /change`, disabling `StartupAppTask` | `installer.js`, `appManager.js:510` | Persistence + defense-evasion |
| koffi FFI + native `.node` extracted from ASAR to temp | `koffi 2.15.1` | Temp-extracted native modules have a long history of being flagged as trojans |

The strategy is **not** to hide the behavior — the behavior *is* the product. It is to establish a verified identity (signing) + reputation so the verdict flips from "unknown app doing scary things" to "known publisher doing scary things on purpose," **plus** removing the few *gratuitous* red flags that add risk for zero benefit:

1. **Kill the Base64 `-EncodedCommand` + `-ExecutionPolicy Bypass` elevation** — replace with a small signed elevation helper (`requireAdministrator` manifest, launched via `ShellExecute "runas"`) taking plain `reg add`/`schtasks` args. The Bypass + encoded combo is itself a hunting signature.
2. **Pre-unpack native modules** with `asarUnpack` so koffi's `.node` loads from disk, not temp.
3. **Sign the inner binaries too** (helper exe + bundled `.ps1` scripts), not just the installer — SmartScreen/SAC check the exe that runs, and reputation is per-hash.
4. **Migrate hot-path PowerShell reads to Win32/koffi** where possible.

**Submission portals fix individual detections after they happen; they do not prevent them.** Use them as a fast-response playbook: Microsoft WDSI (`microsoft.com/en-us/wdsi/filesubmission`, persona "Software developer → Incorrectly detected," submit the specific exe not the bundle, sign in to track), VirusTotal's developer/trusted-source allowlist, and the per-vendor FP forms (Avast/Norton/McAfee/Bitdefender/ESET). Realistic expectation: **you will get flagged at launch**, Smart App Control users may be unable to run Alpine until cloud reputation exists, and signing + clean behavior *reduces but never eliminates* flags for an app whose job is to hijack the shell — plan an ongoing FP-submission loop as a cost of doing business.

### Reliability & Crash Safety (the shell-lockout problem)

This is the single most important quality bar for a paid shell replacement, and the current design is structurally unsafe. Two settings combine into a worst case: `setup.js` points `Winlogon\Shell` directly at the FFI/PowerShell-heavy Electron exe (not a resilient launcher), and `setup.js` sets `AutoRestartShell=0`, disabling Windows' built-in "respawn the shell if it dies" behavior. So if the **main** process crashes (a koffi/dxva2 FFI fault, a native `abort()`, OOM, a bad display-hotplug path), the user is left with a **black screen and a mouse cursor** — escapable only via Ctrl+Alt+Del → Task Manager → Run new task → `explorer.exe`, which a non-technical paying customer will not know. The existing handlers don't help: `uncaughtException`/`unhandledRejection` only `console.error` + `restoreExplorerIfKilled()` (a no-op unless Alpine killed explorer this session), and a hard native crash bypasses JS entirely. (What *is* handled well: per-**renderer** resilience — `loadAppURL()` retries on `did-fail-load` and reloads on `render-process-gone`. The gap is exclusively the main process and whole-process lifecycle.)

**The right architecture — defense in depth:**

- **Layer 1 — a separate native watchdog/launcher process (highest priority).** Point `Winlogon\Shell` at a tiny dependency-free launcher whose only job is to `CreateProcess` Alpine, `WaitForSingleObject`, relaunch on crash with exponential backoff, and — on crash-loop threshold — **fall back to `explorer.exe`** with a "Windows restored — retry Alpine?" dialog. It owns the recovery hotkey so it survives even when Alpine is dead. `app.relaunch()` is **not** sufficient (flaky on Windows; a native crash never reaches the JS that calls it).
- **Layer 2 — stop setting `AutoRestartShell=0`** (leave the default `1`). `AutoRestartShell` alone is not a substitute (effectively deprecated, needs HKLM/elevation, only respawns the registered shell), but as belt-and-suspenders it lets Windows respawn the launcher.
- **Layer 3 — a documented recovery hotkey** (e.g. `Ctrl+Alt+Shift+R`) owned by the watchdog, plus a named "Alpine Recovery" Start-Menu/Desktop shortcut and README docs for the universal Ctrl+Alt+Del → `explorer.exe` escape.

**Crash reporting (you currently have zero visibility).** Add Electron `crashReporter`/Crashpad (captures native minidumps — FFI/koffi faults, the highest-risk failures) and `@sentry/electron` v6 in main + every renderer (unifies JS + native, breadcrumbs, context). Sentry's **Developer plan is free forever** (5,000 errors/mo); the first paid tier is **Team ~$26/mo**. Tag crashes by severity (active-shell vs over-explorer) with version, Windows build, and display topology. Caveat: Electron has documented Windows `abort()` gaps where no minidump is produced, so Crashpad/Sentry complements — never replaces — the watchdog.

**Updating while Alpine *is* the shell (a second landmine).** `updater.js` calls `quitAndInstall(true, true)`, which closes **all** windows then quits — when Alpine is the shell, the user has *no shell* (black screen) for the seconds the NSIS installer runs. Make the watchdog cover the gap (hold-screen window or temporary explorer), prefer **deferred install on user-initiated restart** over mid-session `quitAndInstall`, treat "Alpine exited and didn't return within T seconds" as a crash → relaunch the installed exe, and verify post-update launch (keep the existing `pendingVersion` marker to detect interrupted updates).

A watchdog adds real complexity and a second process to sign and maintain — but for a *shell replacement* it is non-negotiable, not gold-plating. It is the difference between "annoying crash" and "user is locked out of their PC." Building it is also the best legal mitigation: it prevents the exact harm the disclaimers try to cap.

### Licensing & Activation (selling access)

Alpine has **zero** licensing today: no key, no activation, no entitlement check, no trial. The honest threat model first: `app.asar` is **not** protection (`npx @electron/asar extract` unpacks the whole bundle in seconds; even V8 bytecode leaves embedded strings readable). Treat licensing as a **business control, not copy-protection** — stop casual sharing, make "1 purchase = N machines" stick, make a cracked build inconvenient and unsupported. **Do NOT invest in JS obfuscation / V8-bytecode vaults** (high friction, breaks your own debugging, defeated by anyone motivated).

**Worth doing (high ROI):** server-side activation (revoke, count seats, telemetry); **signed license tokens verified with an embedded public key** (the app carries only your *public* key; a pirate can read it but can't mint a valid license); periodic revalidation + offline grace; feature-gating via entitlements. **Not worth doing:** heavy obfuscation; over-strict hardware fingerprints (MAC + disk + CPU false-positive on dock/RAM/VM changes — bind to one stable ID); rolling your own crypto.

**Recommendation — split the two jobs.** (A) Take the money with a Merchant-of-Record; (B) manage licenses with Keygen.

- **Checkout/tax/refunds → Lemon Squeezy** (5% + $0.50, MoR, remits EU VAT / US sales tax, eats chargeback/fraud risk).
- **Licensing → Keygen** (free Dev tier to ~100 active users, then $49/mo; the only option with **Ed25519-signed offline license files + an official JS SDK** `@keygen-sh/keygen-js`; later path to self-hosted CE for free, same SDK). Note Paddle Billing's native license-key fulfillment is **deprecated** — don't pick Paddle expecting turnkey keys.
- **Glue:** a Cloudflare Worker webhook (Lemon Squeezy `order_created` → create Keygen license → email key; refund → suspend) + optional D1 ledger, reusing your existing R2/Cloudflare footprint.

**Pricing model: perpetual + 1 year of updates (not subscription).** Alpine is a local utility, not a per-user cloud service. A lapsed subscription disabling the user's entire desktop shell is a support/reputation disaster (you literally took away their Start menu). Instead: lifetime license, `updates_until` in the token; the app runs forever but the updater only installs builds released before that date. Illustrative: **$29 one-time / 1 device / 1 yr updates; $49 for 3 devices; +$15/yr to keep updating.**

**Implementation sketch:** fingerprint via Windows **MachineGuid** (`node-machine-id`, no admin, stable across reboots); online activation once (Keygen enforces the seat limit, returns an Ed25519-signed file); **offline verification against an embedded public key** every launch; offline grace (re-validate every 7 days, keep working until `now - lastValidatedAt > GRACE` of 14–30 days); read `entitlements`/`updatesUntil` for feature- and update-gating; refund webhook → `suspend`.

> **The sharp combo (echoed by the critic as `critical`):** a *failed* license check must degrade to a **nag banner / feature-lock, NEVER to a no-desktop state**. The desktop and recovery/revert pages must always work, even unlicensed. Lemon Squeezy keys are "just strings" with online-only validation and **no offline grace by default** — that's why the security layer lives in Keygen's signed files. Define safe-degrade behavior for FAIL/REVOKE/EXPIRE, route refund/chargeback webhooks to the same safe-degrade (not a lockout), and document a grandfather rule so lapsed-updates users keep their installed version.

### Payments & Global Tax

For a solo founder in Switzerland selling a downloadable app to consumers in dozens of countries, this is the single highest-leverage operational choice: **use a Merchant of Record.** The reason is legal. When you sell a digital product cross-border, *someone* is legally the seller and must register, collect, file, and remit consumption tax (EU VAT, UK VAT, Swiss VAT, US state sales tax, AU/CA GST) in **every jurisdiction where a consumer buys** — there is no global B2C threshold protecting you.

- A **Merchant of Record** (Paddle, Lemon Squeezy, FastSpring, Gumroad, Polar) buys your product and resells it; *their* tax IDs are on the invoice, *they* register/remit in 100+ countries, *they* carry audit liability. You receive a payout.
- **Stripe is a PSP, not an MoR.** Stripe Tax *calculates* but **you remain the legal seller** and must hold the registrations and file the returns.

**Why this is acute for Switzerland:** under the 1 Jan 2025 VAT reform, a foreign digital-services provider must register for Swiss VAT once **worldwide** turnover exceeds CHF 100,000, and there is effectively a **nil threshold for B2C digital services** — once you cross CHF 100k globally and make *any* B2C sale into Switzerland, all Swiss supplies are taxable from the first franc. As a Swiss-based founder you'll plausibly trip this, then separately owe EU VAT (Non-Union OSS or per-country), UK VAT (nil registration threshold for non-UK sellers), and US sales tax across ~45 economic-nexus states. Doing this directly is a part-time job and a permanent audit surface; an MoR makes it disappear into the ~5% fee.

| Platform | Real all-in (intl. consumer) | MoR? | Built-in keys | Notes |
|---|---|---|---|---|
| **Lemon Squeezy** | ~6.5–7% | Yes | Yes (activate/deactivate/re-issue) | Now **Stripe-owned**; best fit for a solo dev |
| **Polar.sh** | ~6.5% (free tier) | Yes | Yes | Open-source, Stripe-based, modern API; newer/smaller |
| **Paddle** | ~5.5–7% | Yes | Via integrations | Mature; confirmed **CHF payouts**. ⚠️ **June 2025 FTC settlement: $5M + permanent ban from processing for tech-support telemarketers / pop-ups about computer security or performance** — expect stricter KYC |
| **FastSpring** | 10%+ on low-ARPU subs | Yes | Yes | Sales-led, expensive for cheap subscriptions |
| **Gumroad** | ~10.5% | Yes | Basic | ~2x the fee, weak licensing |
| **Stripe + Tax (DIY)** | ~3.5–4% fees, but **you register/file/remit** | No | No | Cheapest on paper, highest legal burden |

**Recommended stack:** Lemon Squeezy as MoR (or Polar.sh as the modern OSS alternative), using its built-in license keys for v1; add Keygen later only if you need offline cryptographic files / per-seat enterprise / entitlement-gated updates. **Before launch**, run a 5-minute test signup to confirm (a) Switzerland is selectable for *payouts*, (b) CHF/EUR payout currency, (c) the KYC docs they want. Lemon Squeezy bank payouts cover 79 countries (Switzerland not explicitly confirmed in the public docs snapshot — verify, PayPal payout is the fallback); Paddle confirms CHF payouts; Polar pays via Stripe Connect.

**The Paddle FTC settlement is a genuine yellow flag for *this* product:** it permanently bans Paddle from processing for merchants marketing on "computer security or performance" with pop-ups. A product that markets on "performance" is exactly the profile MoRs now screen hard — which is another reason to keep claims honest (Part C) and not just an FTC risk but a **payment-processor-rejection risk** that can cut off your ability to sell entirely. Write a clear refund policy (e.g. 14-day money-back) and the EU right-of-withdrawal waiver; note FastSpring/Gumroad keep their fee on refunds.

### Legal & Compliance Docs

Alpine is higher-risk than a normal app sale because **a bug in this code can leave a paying user at a black screen with no taskbar at next login.** That one risk drives every clause. Four documents are required before charging money.

**1. EULA — the load-bearing document.** Three clauses that actually protect you: (a) **"AS IS" / "AS AVAILABLE"** disclaiming implied warranties "to the maximum extent permitted by applicable law" (Apple's Licensed Application EULA uses exactly this); (b) **limitation of liability** in two layers — exclude indirect/consequential damages, explicitly naming **lost profits, lost data, and business interruption** (precisely what a desktop-lockout bug produces), and cap aggregate liability at the fees paid (e.g. "shall not exceed the fees paid in the 12 months preceding the claim"); (c) the **recovery / shell-restoration disclaimer** — the custom clause no template has — stating the software modifies the Windows login shell and giving the literal recovery steps (`Ctrl+Alt+Del → Task Manager → File → Run new task → explorer.exe`, plus the in-app Revert page). **Critical limit:** under UK UCTA / Consumer Rights Act 2015 and EU national law you **cannot** disclaim liability for death/personal injury from negligence, for fraud, or (often) gross negligence, and a B2C clause creating a "significant imbalance" is unenforceable as unfair — so the caps hold for ordinary bugs but not bad faith. The **license grant** must match the entitlement model you build (per-user, non-transferable, no reverse-engineering/resale, termination on non-payment/breach) — write it alongside the activation code.

**2. Privacy policy — triggered the moment anything phones home.** The moment you add license activation, crash reporting, or update analytics you process personal data. Operating from Switzerland and selling into the EU puts you in scope for both the revised **Swiss FADP** (in force since 1 Sept 2023) and **GDPR**. Lawful basis: activation/fraud-prevention on contract necessity + legitimate interest; optional telemetry on **consent (opt-in)**. Disclose: license key, machine ID/hardware hash, IP, OS version, crash stack traces (flag that traces can contain usernames in paths), lawful basis, retention, sub-processors (MoR, Cloudflare R2, Sentry), transfers, and data-subject rights. Build to GDPR and you clear FADP too (FADP is lighter but still requires you to *inform*).

**3. Refund policy + EU/UK right of withdrawal.** EU/UK consumers get a **14-day right of withdrawal**; for instant-download software you must **switch it off at checkout** via **CRD Art. 16(m)** — all three before download: (i) prior express consent to start immediately, (ii) acknowledgement they lose the withdrawal right, (iii) durable-medium confirmation (Art. 8(7)). In practice: a non-pre-ticked checkbox plus a confirmation email; the CJEU reads this strictly (C-641/19). Note Directive 2023/2673 adds a mandatory cancel button (applying from 19 June 2026) — relevant only if you ever sell subscriptions directly.

**4. Recovery / disclaimer notice — surface it at three touchpoints:** the sales page (pre-purchase informed consent), the first-run setup window before "set as shell," and a help/FAQ.

**Where an MoR carries the load:** Paddle/Lemon Squeezy as MoR handle VAT calculation/invoicing/remittance worldwide (removing the Non-Union OSS registration a Swiss seller would otherwise need), refunds/chargebacks, and the consumer-facing withdrawal mechanics. **What the MoR does NOT cover — you still own:** the product EULA, the privacy policy for your telemetry, and the shell-replacement risk disclosure. Get the **skeletons** from a generator (iubenda — explicit Swiss FADP coverage, ~$3.49/mo — or Termly) and **pay a lawyer (a few hundred to ~CHF/€1–2k)** for the three things templates get wrong: the liability cap + shell-lockout disclaimer, whether the caps survive EU/UK B2C unfairness tests, and the license grant. Pick Swiss governing law if you like, but you cannot contract a consumer out of their home-country mandatory rights. The best "legal" protection is the engineering one: a watchdog/auto-revert that restores `explorer.exe` prevents the harm the disclaimers try to limit.

### Bundled-Asset & Dependency Licensing

**The code dependencies are clean; the bundled creative assets are the highest-risk item before charging money.** Two concrete problems verified in the repo:

1. `public/cursor/Moga White/` ships the **"Free Version"** of a DeviantArt/Ko-fi cursor by *moyash* (the only metadata is `Install.inf`). **No LICENSE file.** DeviantArt's default license for any submission is **CC BY-NC-ND** unless the artist opts into commercial rights — **NonCommercial alone disqualifies it** for a paid product, and a free download tier almost never carries commercial *redistribution-inside-a-paid-app* rights. This is the worst-case fact pattern: a commercial product redistributing an unmodified copyrighted asset with no written license. **Treat as the #1 launch blocker.**
2. `wallpapers/` contains `Grainy Valley.jpeg`, `Midnight Windows.png`, `Quiet Moment In Nature.jpg` with **no sidecar license, no source URL, no credit**. Provenance is undocumented, which is itself the defect. Even royalty-free libraries restrict what you're doing — the **Unsplash License** forbids selling an unaltered photo standalone and "replicating a similar service."

**Fix — replace, don't gamble, and keep written proof committed to the repo.** Cursors: commission a buyout (~$50–300, cleanest), **Bibata (GPL-3.0** + offer-of-source NOTICE), a self-authored set (RealWorld Cursor Editor, free for commercial use), CC0 packs (OpenGameArt), or **ship no cursor** and use a built-in Windows scheme. Wallpapers: commission/generate or use CC0 (Wikimedia Commons, OpenGameArt). For each shipped image, store an `ASSETS-LICENSES.md` row (filename, author, source URL, license, date) — *if you can't produce that line, don't ship the image.*

**Electron / Chromium / FFmpeg.** Shipping Electron commercially and closed-source is fine and routine. Electron is MIT, but it bundles Chromium and a dynamically-linked **FFmpeg (LGPL-2.1)** — obligations are **attribution + LGPL relink-ability**, not app source disclosure. Verified: a 15.98 MB `LICENSES.chromium.html` and the proprietary-codec `ffmpeg.dll` are present. Required FFmpeg notices: *"This software uses code of FFmpeg licensed under the LGPLv2.1"* on the buy page, *"…uses libraries from the FFmpeg project under the LGPLv2.1"* in the About box, and a statement in the EULA, plus a link to the **matching FFmpeg source** for your Electron version. **Strip the proprietary codecs you don't use:** Alpine plays no media, so swap in Electron's **patent-free FFmpeg** via an `afterPack` hook to remove H.264/AAC/MP3 and the MPEG-LA patent exposure. **All npm deps are clean** (koffi MIT, HeroUI MIT, lucide-react ISC, react/tailwind/electron-updater MIT) — no copyleft trigger — but re-run a `license-checker` scan each release to catch GPL/AGPL creep. Produce a consolidated `THIRD-PARTY-LICENSES.txt` with `generate-license-file` wired into the release script, ship it + `LICENSES.chromium.html` via `extraResources`, and add an in-app "Open Source Licenses" link.

### QA Matrix & Electron Security Hardening

**Ground truth.** `contextIsolation: true` + `nodeIntegration: false` are set on all five windows — the correct modern baseline (the single most important thing). `sandbox` is never set explicitly (relied on as a default), `webSecurity` is on. **Missing entirely (zero grep hits):** Content-Security-Policy, navigation lockdown (`web-contents-created`/`will-navigate`/`setWindowOpenHandler`), IPC sender validation, Electron fuses + ASAR integrity, code signing, and security ESLint plugins. The **highest-value attack surface** is `runCommand.js` — `runDirect()` routes renderer-supplied `query` to `shell.openExternal`, `shell.openPath`, `explorer.exe <query>`, and `Start-Process`. The IPC boundary is the only thing between web content and arbitrary command execution, which is exactly why CSP + navigation lockdown + IPC validation are guardrails, not niceties.

**Hardening to do before charging:**
- **Navigation/window lockdown** (1–2h, do first): `app.on('web-contents-created')` → `setWindowOpenHandler(() => ({action:'deny'}))`, a `will-navigate` allowlist (localhost in dev / `file://` in prod), and deny `will-attach-webview`. Deny-by-default costs nothing since Alpine never navigates away.
- **CSP** via `onHeadersReceived` (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, allow `alpine-wallpaper:` for `img-src`; HeroUI/Tailwind likely need `style-src 'unsafe-inline'` — tighten after testing).
- **IPC sender validation** (`event.senderFrame` allowlist) + argument validation on the dangerous handlers, restricting `openExternal` to `http`/`https`/`ms-settings`.
- **`sandbox: true`** explicit on all five windows (the preload already works under sandbox).
- **Electron fuses + ASAR integrity** (`runAsNode:false`, `enableNodeCliInspectArguments:false`, `enableNodeOptionsEnvironmentVariable:false`, `enableEmbeddedAsarIntegrityValidation:true`, `onlyLoadAppFromAsar:true`, `enableCookieEncryption:true`, `grantFileProtocolExtraPrivileges:false`). This stops someone unzipping `app.asar`, injecting a license bypass, and re-running — directly relevant because you sell access. **Caveats:** `grantFileProtocolExtraPrivileges:false` can break the packaged `file://` renderer (move to a custom `app://` protocol if so), and integrity only has teeth **once the exe is code-signed**.
- **Permission lockdown** (`setPermissionRequestHandler` → deny all) + `eslint-plugin-security` + `tsc --noEmit` in CI.

**QA / hardware-compatibility matrix** (a shell's blast radius is "user can't reach their desktop," so the matrix is broad):
- **OS axis:** Windows 10 22H2 reached end of consumer support Oct 2025 — decide explicitly whether to support it (legitimate to floor at Win11 to shrink the matrix); Win11 24H2 (build 26100) is the primary target; test fresh-install vs in-place-upgraded.
- **Display/DPI axis (your biggest risk — one window pair per display):** single/dual/3+ monitors, **mixed DPI** (4K@150% + 1080p@100%), hotplug (add/remove monitor while running, dock/undock, RDP in/out, unplug primary), rotation, scale-change while running.
- **Hardware/brightness axis:** internal panel (WMI) vs external (DDC/CI via dxva2); **a monitor that doesn't support DDC/CI must degrade gracefully** (hide/disable the brightness slider), since DDC/CI commonly fails over USB-C hubs/KVMs/docks; Intel/NVIDIA/AMD GPUs; no-battery desktop, no-Wi-Fi, Bluetooth-absent machines.
- **User/locale axis:** **non-admin standard user** (the primary target — verify the whole flow with no elevation including the HKCU shell write); **non-English locale** (PowerShell output parsing in network/battery/bluetooth modules is the classic break point — test German + one non-Latin locale).
- **The non-negotiable safety test:** on every OS build, install → set as shell → reboot → confirm topbar+desktop → uninstall → reboot → **confirm Explorer returns.**

**Lightweight automation (don't over-build):** ESLint `--max-warnings 0` + `eslint-plugin-security` and `tsc --noEmit` as release gates; a **Playwright `_electron.launch` smoke test** on the *packaged* app (asserts `window.shell`/`window.topbar` exist, no `render-process-gone`/`console.error`); a post-build assertion that fuses are flipped and the ASAR integrity resource exists; and a written manual QA script for the matrix above. (Spectron is dead; Playwright is the supported path.)

### Operations (support, diagnostics, rollout, i18n, accessibility, clean uninstall)

Synthesized from the critics' `missingItems` — the operational selling infrastructure beyond the paywall:

- **Settings/profile backup, export & migration (the single biggest under-covered item).** All user config lives in `userData` with no export/import. For a *shell* this is acute: a reinstall/reimage/new-PC silently loses every customization the customer paid to set up, and the planned debloat/boot/snappy-mode **undo journals live only in `userData`**, so wiping it strips the ability to revert system changes → a permanent-lockout/liability vector. Ship a versioned, schema-stamped "Export Alpine profile" (.json) + Import that round-trips topbar layout, tray order, wallpaper, tiling, and the change/undo journals; auto-back-up `userData` on every update; and store revert journals somewhere reinstall-safe (ProgramData + the export).
- **Feature-update Shell-reset self-heal (critical).** `ensureShellRegistration()` re-asserts `Winlogon\Shell` *only if Alpine launches*. Win11 feature/in-place upgrades (and the documented July 2025 KB5062553/KB5072911 provisioning-race shell regressions) can reset Shell to `explorer.exe` at first sign-in — at which point Alpine never launches to self-heal. Mitigations: the native watchdog must be registered via a mechanism that survives feature updates and re-point Shell back; add an `HKCU Run` "shell sentinel" that runs under explorer if Alpine got reset and offers one-click re-enable; detect "we were the shell last boot but explorer is now" and show a post-update recovery prompt; document that major upgrades may require re-running setup. (Distinct from the crash-watchdog: crash ≠ OS-initiated registry reset.)
- **In-app "Generate support report" diagnostics bundle.** Structured logging (electron-log) for main + renderers + watchdog, and a one-click export `.zip` (app/watchdog logs, exit/restart counts, Windows build/edition, display topology + DPI, current `Winlogon\Shell` value, license state, change/undo journals, redacted env) for the user to attach to a ticket. Scrub secrets (license key, fingerprint) and disclose in the privacy policy. Sentry alone doesn't give a user-shareable, offline bundle for non-crash "it behaves wrong" tickets.
- **Support channel + externally-hosted recovery/status page + changelog.** A support inbox with templated responses for the top failure modes; a **public, externally-hosted** status/recovery page (NOT in the app — if Alpine breaks the desktop the user can't open it) hosting the literal Ctrl+Alt+Del → explorer.exe steps, an uninstaller/repair-tool link, and incident notices for bad auto-updates; and a published changelog so paying users know what each silent auto-update changed.
- **Beta/staged-rollout update channel.** `updater.js` has `autoDownload=false` but **no channel/`allowPrerelease`/staged-rollout config — every build goes to 100% of paying users at once.** For an app on the **login critical path**, one bad release can lock out the entire customer base simultaneously. Adopt electron-updater's beta channel (opt-in toggle) + `stagingPercentage` (10→50→100), strict semver + a machine-readable changelog surfaced before applying, and a rollback rule (a pulled staged release needs a *higher* version than the broken one).
- **Standby/sleep/resume, lock/unlock, RDP, fast-user-switching robustness.** As the persistent shell, Alpine must survive every session-state transition. After resume, FFI handles (dxva2 DDC/CI), the persistent volume PowerShell host, and WinEvent hooks can be stale/dead → a frozen topbar / hanging brightness slider with no taskbar fallback. Add explicit resume/SessionSwitch handlers that re-establish FFI handles, restart the PS host if dead, re-enumerate displays, and re-arm hooks — and add these as pass/fail QA gates.
- **i18n + locale-robust parsing.** No i18n framework exists (all strings hardcoded). Ship English-only for v1 but externalize strings now (retrofitting later is costlier). More urgent: Alpine **parses localized PowerShell/Win32 output** (battery, network, bluetooth, update) — on non-English Windows the strings and date/number formats differ and parsing silently breaks, showing wrong/blank status to paying users. Migrate hot-path reads to locale-invariant APIs (koffi/Win32, WMI numeric fields) and treat the non-English-locale QA row as a *parsing-correctness* requirement, not a smoke test.
- **Accessibility + EAA scope.** Alpine replaces the taskbar/Start/tray/Alt-Tab with custom React UI, but only ~19 aria/role usages exist and there's no focus-management strategy — i.e., the shell the user lives in all day may be unusable by keyboard/screen-reader users, *replacing OS chrome that was accessible*. The **EU Accessibility Act became enforceable 28 Jun 2025** (WCAG 2.1 AA / EN 301 549); scope for downloadable consumer desktop software is genuinely ambiguous and a sub-10-employee founder likely qualifies for the microenterprise *service* exemption, but that's fuzzy for product manufacturers. Action: make a documented EAA-scope determination, ensure the MoR checkout is the accessible-commerce surface, and at minimum make flyouts/launcher/tray/settings fully keyboard-operable with visible focus and basic ARIA.
- **Clean-uninstall completeness.** Audit removal/restoration of: the installed cursor theme (**restore the user's prior scheme**, not just blank it), `EnableXamlStartMenu`/`RestartApps`, the disabled `StartupAppTask` (**verify it actually re-enables**), `userData` + change/undo journals + license file, and any HKLM `AutoRestartShell` edit (confirm uninstall restores `1`). Verify a reinstall-over-existing-install preserves license activation and settings (otherwise users re-activate against their device limit and churn). Add an uninstall feedback hook.
- **Recovery-state detection bug.** `setup.js:169 getSetupStatus` uses exact-match (`currentShell !== 'explorer.exe'`) while `isDefaultShell`/`verifyShellWrite` (lines 140/145) use `.includes('explorer.exe')` — the exact-match path misreports when Shell is a quoted/pathed explorer value, masking a successful revert. Recovery logic must be exactly correct because it is the user's only escape from a lockout.

---

## Part B — Performance: Making Windows Faster (as features)

### Boot & Startup

Alpine already has the hard part: `autostart.js`/`appManager.js` enumerate Run/RunOnce/Startup-folder/MSIX entries, classify app vs system, show which are running and memory-heavy, and toggle them via the same `StartupApproved` mechanism Task Manager uses. The opportunity is a **"Speed up startup"** flow that (a) **measures** boot credibly, (b) adds **delay/stagger**, (c) offers a curated service-trim list, and (d) exposes Fast Startup as an informed toggle. Honest framing: on a modern SSD the wins are **single-digit seconds + a snappier first-30-seconds**, not "boot 3x faster." **Load-bearing constraint:** Alpine is `asInvoker` (no elevation), so System Restore points, HKLM service start-type edits, and Fast Startup (`HiberbootEnabled` in HKLM) **all require admin elevation** — design around this, don't pretend it's all silent.

Ranked by honest impact:
1. **Disable / delay startup apps (highest impact).** Disable unwanted ones (already shipped). **Delay/stagger** wanted-but-not-urgent apps (Discord, Spotify, Steam, OneDrive) to t+30/60/90s so the desktop is interactive first. Because **Alpine *is* the shell and launches autostart entries itself** (`processAutostart()`), it can implement stagger natively with a `setTimeout` queue — **no Task Scheduler, no elevation** — a real architectural advantage over standalone delayers. **Risk: LOW. Reversibility: trivial.**
2. **Auto-start service trimming (moderate, needs curation + elevation).** Safe-to-set-Manual on a single-user PC: `SysMain` (marginal on SSD), `DiagTrack` (Manual not hard-disable — feeds Update/Defender cloud signals), `DoSvc`, `Spooler` (if never printing), `Fax`, `bthserv` (no BT hardware), `WSearch` (last — disabling breaks instant search), Xbox services, Tablet input. **NEVER touch** `wuauserv`, `CryptSvc`, `EventLog`, Defender, `RpcSs`, `DcomLaunch`, firewall, `Power`, `Schedule`, `ProfSvc`, `gpsvc`. **Ship an allowlist, never a denylist.** On NVMe this is the *least* impactful lever for raw boot seconds — sell it as fewer background processes / less idle CPU, not "faster boot." **Risk: MED, admin required, Manual-first one-at-a-time.**
3. **Fast Startup (informed toggle, not a recommendation).** Big win on HDDs (30–90s → 10–20s), small on SSDs. For Alpine's SSD users **leaving it ON is usually correct** — disabling makes boot *slower*. Offer it as an explainer toggle surfacing real tradeoffs (stale USB/BT/network init, dual-boot NTFS locks, cold-boot-needed updates). **Risk: LOW–MED, admin required.**
4. **Scheduled tasks at logon (low, surgical only).** Surface vendor updater/helper tasks via `schtasks /query`, allowlisted; keep Windows maintenance tasks untouched.

**Credible measurement (what makes it trustworthy):** read **Event Log → Diagnostics-Performance, Event ID 100** (`BootDuration`/`MainPathBootTime`/`BootPostBootTime`, no install, no elevation) via `Get-WinEvent`; events 101–110 attribute *which* app/service/driver degraded a boot. Heavier optional paths: WPT `xbootmgr` + WPA `FullBoot` (gold standard, multi-reboot, advanced/export only) and BootRacer (corroboration). **Caveats to bake into the UI:** boot time is noisy (updates/indexing/AV first-run skew it) — measure an **average of 3+ cold boots**, label whether Fast Startup was on, never claim a single-boot delta as proof.

**Feature design:** a `bootOptimizer.js` module (handlers + `start(broadcast)`), a `useShellState` hook, types in `shell.d.ts`, and a settings page sibling to `appsStartupPage.tsx` with tiered, risk-rated recommendations — **Tier 1** (one-click, no elevation, LOW: disable/stagger heavy apps, default *delay* over *disable*), **Tier 2** (one elevation prompt, MED: allowlist service-to-Manual + Fast Startup + opt-in task disables). **Before any Tier 2 change, create a System Restore point** (`Checkpoint-Computer ... MODIFY_SETTINGS`, handle the 24h throttle + `Enable-ComputerRestore`). Independently keep an Alpine **change journal** in `%APPDATA%` so in-app Undo works even if Restore is off. Re-measure after a reboot. Every tweak gets one-click Undo restoring the exact prior value — the differentiator vs sketchy "PC boosters."

### Safe Debloat

A debloat feature is a strong differentiator for a shell-replacement, but the bar is high because debloat operations are user-visible, edition-dependent, and **partly irreversible**. Independent 2025 testing of Win11Debloat / WinUtil / Tiny11 found "small gains, big risks": modest RAM savings but real breakage when tools touch update/servicing or security. Your edge is **not** "removes the most" — it's **"the debloat that never breaks your PC and that you can fully undo."**

**The hard line — NEVER touch (security & supportability):** Microsoft **Defender** (`SecHealthUI` can't even be removed per-user; Tamper Protection blocks it anyway), **Windows Update / servicing** (`wuauserv`/`UsoSvc`/BITS), **Microsoft Store** (can't be reinstalled easily), **Edge WebView2 Runtime** (rendering engine for Office/Teams/Widgets), **App Installer** (winget), and **shared runtimes** (VCLibs/.NET Native/UI.Xaml — never bulk-pipe `Get-AppxPackage | Remove-AppxPackage`). **Ship a central denylist guard** that refuses any operation resolving to these — your single best protection against a support disaster.

**Curated safe list (ratings: Green = safe/reversible/default-on; Yellow = safe with a tradeoff, default-off; Red = don't offer):**
- **Telemetry & diagnostics (Green):** `AllowTelemetry=0` (honesty flag — on **Home/Pro this is floored to "Required"**; only Enterprise/Education truly honor `0`, so market as "minimized"), disable Tailored Experiences / advertising ID, disable `DiagTrack` service (reversible; feature updates can re-enable it).
- **Preinstalled consumer Appx (Green, per-user `Remove-AppxPackage`):** Solitaire, Bing News/Weather, Xbox overlay apps, legacy Zune, People, Mail/Calendar, To Do, consumer Teams, Clipchamp, Power Automate, Tips, QuickAssist — all Store-reinstallable. **Yellow (default-off):** Phone Link, new Outlook, Feedback Hub, Office Hub, OEM bloat (detect *dynamically* against a known-bloat dictionary, never remove OEM driver/firmware/function-key utilities), and the in-box utilities (Photos/Camera/Snipping/Paint/Notepad/Calculator/Terminal). Copilot/Recall (Yellow — handle the "Windows refuses to remove" Event ID 874 case gracefully).
- **Background apps & startup (Green):** `BackgroundAccessApplications\GlobalUserDisabled=1`; trim startup via the existing `StartupApproved` parser.

**Reversibility — the make-or-break design problem.** Registry/service/task tweaks are fully reversible (snapshot prior value, restore on undo — mirrors `installer.js`). **Appx removal is only partly reversible and *scope* matters enormously:** default to **per-user `Remove-AppxPackage` only** (no `-AllUsers`, no `Remove-AppxProvisionedPackage`, no bulk pipe) — this stays inside Alpine's asInvoker/per-user model and keeps removals reinstallable from the Store. Record every removed package family to an undo manifest in `userData`; offer one-click "Restore Windows apps." Microsoft's supported `RemoveDefaultMicrosoftStorePackages` policy is the cleanest mechanism but is **MDM/GPO-only, Enterprise/Education + 24H2** — not your Home/Pro customer base; detect edition to not fight it.

**Operational guardrails:** central denylist guard; edition/build detection before showing options; **drift-detect + "offer re-apply"** (feature updates re-enable DiagTrack/re-stage apps — *don't* silently re-run on every boot). **Feature design** follows the documented module recipe (`debloat.js` with `debloat:scan/apply/undo/status`, ops modeled as data with per-op `detect/apply/undo/risk/supportedEditions`, scan-first checklist with risk badges and plain-English consequences, undo manifest + "Revert all debloat changes," transparency UI showing the exact registry path/package/service, Conservative/Balanced/Aggressive profiles defaulting to Conservative).

**Honesty:** performance gains are **modest** ("very little memory" in 2025 testing) — sell it as **privacy + tidiness + control**, not "2x faster"; telemetry is **reduced, not eliminated** on consumer editions. The real differentiator is **reversibility + restraint**, and it pairs with the EULA work: include a clear "this modifies Windows; we never disable security or updates; everything is per-user and reversible" disclosure.

### Runtime CPU/GPU/Memory (honest efficacy)

There is **no tuning code today**. A "Performance" page would be net-new. Architectural warning: most high-value knobs (power plans, SysMain, page file, HAGS) are machine-scoped (HKLM/service/SYSTEM power policy) and **require admin** — either request just-in-time UAC for the apply step, or restrict to per-user knobs (power slider/overlay, working-set, Game Mode, foreground priority). A non-elevated SysMain/power-plan write **silently fails**.

**The honest efficacy table** — of ~7 popular tuners, only ~3 are defensible, and the most-marketed (RAM cleaning) is the worst:

| Tweak | Real-world impact | Verdict |
|---|---|---|
| **Power mode: Best/Ultimate Performance** | Noticeable only on plugged-in desktops under sustained load; **measurably worse battery/heat on laptops** | Ship as a laptop-aware toggle |
| Min/Max processor state sliders | Defaults already optimal; lowering max only *saves battery* | Don't expose; placebo for perf |
| **HAGS** | ~+0.3% avg FPS / +1.6% 1% lows; can cost ~1GB VRAM and **stutter on ≤8GB GPUs**; required for DLSS3 Frame Gen | Optional, off by default, honest label |
| **Game Mode** | Small real 1%-low gain on **constrained PCs (≤16GB, iGPU/old dGPU)**; "does very little" on high-end | Safe to expose |
| SysMain/Superfetch disable | On modern SSD: **no measurable gain**; Microsoft advises against | Don't disable by default; placebo |
| **"RAM cleaner" / empty standby / working-set trim** | Standby is a **cache, not waste** — flushing it makes the next launch read from disk again, slower; the dropping graph is psychological | **Never ship a generic booster** |
| Page file fixed/move/disable | System-managed is best on SSD; **disabling breaks crash dumps** + risks OOM | Don't touch |
| Process priority High/Realtime | High helps one foreground app slightly; **Realtime starves mouse/keyboard/disk and can hang the box** | Expose max **High**, never Realtime |

**The few real wins (ship these):** (1) **Power-mode toggle (laptop-aware)** — the Win11 slider/overlay, plus unlocking **Ultimate Performance** via `powercfg -duplicatescheme e9a42b02-…` on desktops (capture the **NEW GUID** from stdout and `setactive` it — using the literal original GUID is the #1 reason scripts "don't work"); detect battery (`battery.js`) and warn/auto-revert on unplug. (2) **Game/Focus Mode** — real on constrained hardware, near-harmless elsewhere. (3) A **narrow, honest standby-list / working-set tool** *only* for the one legit symptom (micro-stutter from a bloated standby list during sustained gaming on RAM-constrained systems) — ship it as a single manual "Clear standby memory (advanced — stutter-only)" button, **no "freed X GB" hero number, no timer, never called a booster.**

**Do NOT ship:** scheduled RAM booster/auto-trim, SysMain-disable, page-file edits, Realtime priority, raw min/max % sliders. Add an in-app **"Why we don't include these"** note citing they're placebo/harmful — turning the omission into a trust signal. **Reversibility:** record prior state before each apply (`powercfg /getactivescheme`, prior overlay/priority/Start value) so a single "Restore defaults" + the uninstall-cleanup path roll everything back.

**Bottom line:** runtime tuning is **mostly marketing hype**. A credible minimal set (power mode, Game Mode, foreground priority) with honest labels and full reversibility becomes a small **trust differentiator** vs the placebo optimizer market — but it is **not** a headline selling point, and the perf delta is single-digit-percent at best. The biggest risk is reputational: a fake RAM booster or broken crash dumps would do more damage than the feature is worth.

### Perceived Responsiveness / "Snappy Mode"

**The best ROI on the roadmap.** Perceived speed beats measured speed: under ~100ms an action feels instantaneous, up to ~1s flow is preserved, beyond ~1s you need explicit feedback (Nielsen). Almost every Windows UI animation is a deliberately-injected 150–400ms delay between an action and its visible result — removing it doesn't make hardware faster, it removes *manufactured* latency in the band humans are most sensitive to. These tweaks are high-ROI because they're **immediately noticeable, safe** (documented user-facing settings applied programmatically), and **fully reversible** — all per-user (HKCU), no elevation, fitting the asInvoker model. **Important caveat:** many toggles affect **legacy/Win32/classic-shell** surfaces; modern XAML surfaces (Win11 Start, several flyouts) often ignore them — and since Alpine *replaces* most of that chrome with its own React UI, **the biggest real win is Alpine's own UI latency** (below).

**Tier 1 — ship these (high impact, safe, instant):** kill UI animations/fades (`UserPreferencesMask` and/or `SystemParametersInfoW(SPI_SETUIEFFECTS, FALSE)`), disable window min/max animations (`MinAnimate="0"`), cut **`MenuShowDelay`** from the default **400** to 20–50 (the single most-felt classic tweak), disable transparency (`EnableTransparency=0`). **Prefer the API route** — you already load `user32.dll` via koffi in `tiling.js`; add `SystemParametersInfoW` and call the granular flags (`SPI_SETMENUANIMATION`, `SPI_SETTOOLTIPANIMATION`, `SPI_SETSELECTIONFADE`, `SPI_SETMENUFADE`, …, master `SPI_SETUIEFFECTS`) with `SPIF_UPDATEINIFILE | SPIF_SENDCHANGE` so changes persist and broadcast without a sign-out — hand-rolled `UserPreferencesMask` masks drift across Windows builds.

**Tier 2 — separate sub-toggles, mild tradeoffs:** `VisualFXSetting=2` "best performance" (honesty flag — alone it often doesn't flip the effects; the GUI also writes the mask/`MinAnimate`/`DragFullWindows`, so rely on Tier 1 for the real work), `DragFullWindows=0` (snappier on weak GPUs, looks dated), modest `HungAppTimeout`/`WaitToKillAppTimeout` (these don't speed anything up — they make the system *give up faster* on stuck apps; too-low values can kill apps before they save, so conservative defaults only).

**Tier 3 — DO NOT bundle:** the famous **timer-resolution tweak** (`NtSetTimerResolution` to 0.5–1ms). **Windows 10 2004+ made timer resolution per-process**, so a shell-wide tweak gives near-zero benefit to other apps, the FPS gain is 0–5% even in the best gaming case, and on laptops it *costs* battery — pure hype for a desktop shell. (If you want smoother *Alpine* animations specifically, scope `timeBeginPeriod(1)` to the Electron process during an animation only.) Also skip the global `ForceDisableModeChangeAnimation` (HKLM = elevation).

**The actual biggest lever — Alpine's own UI latency.** Snappy Mode feels hollow if your topbar flyouts, launcher, and Alt-Tab have their own 200–300ms ease animations. Concrete wins: a **"reduced motion" path in Alpine's own CSS/JS** (<100ms transitions when Snappy Mode is on — the win you control end-to-end); **pre-create and hide the launcher/flyout windows** with a matching `backgroundColor` and `backgroundThrottling:false` so opening is an instant `show()` not a cold renderer boot; **extend the optimistic-update pattern** (already used for volume/monitors) to every control so the UI never blocks on a ~200ms+ PowerShell round-trip. Verify `DragFullWindows=off` doesn't break the new live-drag zone-snapping overlay.

**Implementation:** `performanceMode.js` (handlers + `start(broadcast)`), **snapshot the original value of every key/SPI parameter before first write** to a JSON in `userData`, implement an exact revert (not guessed defaults), wire revert into the existing "revert system changes" page + `--uninstall-cleanup`, reuse `regAdd`/`regQuery` from `installer.js`, surface one master toggle + an Advanced disclosure for Tier 2 with a before/after preview and a tradeoffs note. Disclose tradeoffs in-product (disabling transparency/animations changes the look; "best performance" removes drop shadows some users want) — all one-click reversible, no admin required.

### Honesty, Claims & Measurement

You are entering a category littered with FTC settlements and AV "optimizer" flags. **The winning move is the opposite of the snake-oil playbook: only do things that are measurable, and measure them in front of the user.** Alpine is *not* an "optimizer" by architecture — it's a shell replacement that already touches the surfaces that genuinely affect perceived speed (startup/Run keys, the shell). Fold in an honest, narrow "make startup leaner + show me the proof" capability and skip everything in the snake-oil column.

**What moves the needle (roadmap) vs. snake oil (permanent do-not-build):**
- **Real, measurable:** SSD/NVMe upgrade (boot 50–70% faster — *advise*, don't perform); add RAM if RAM-starved (*advise*); **fewer startup items** (core Alpine feature; "best perceptible speed gain"); **debloat** (~600–800MB idle RAM on bloated builds, 30–40% fewer idle processes); current GPU drivers (situational; deep-link, don't auto-flash); power-plan/thermal (surface, warn on throttle); malware removal (out of scope — don't pretend to be AV).
- **Snake oil — do NOT build:** registry cleaners (Microsoft + security community call them "snake oil," can break the system), generic RAM/memory boosters, internet/TCP "accelerators," SSD defrag, and **one-click "fix N problems" scans** (the exact pattern the FTC nuked).

**The legal risk of overpromising "faster PC" (FTC exposure)** is not theoretical:
- **Restoro / Reimage (2024) — the case to study.** Two firms paid **$26 million** for scans that "typically identified purported serious issues" even on clean machines, then upsold paid "PC Repair Plans"; the order **prohibits misrepresenting security or performance issues**. The FTC distributed **$25.5M+ to victims** in 2025.
- Office Depot/Support.com ($35M, 2019); Innovative Marketing / WinFixer; Kristy Ross ($163M, affirmed) — all scareware optimizers.
- **The standard you must meet:** the FTC requires **"competent and reliable evidence" supporting a performance claim *at the time the claim is made*** — post-hoc justification is unacceptable, burden entirely on you. Penalties up to **~$53,088 per violation** (2025 inflation-adjusted). Testimonials must be real, typical, and substantiated.

**AV / PUA classification risk (Microsoft Defender, often in block-mode by default).** Microsoft's PUA "lack of choice" criteria flag software that *"displays exaggerated claims about your device's health,"* *"makes misleading or inaccurate claims about files, registry entries,"* or *"displays claims in an alarming manner about your device's health and requires payment … for fixing the purported problems"* — almost word-for-word the FTC's Restoro theory. **Microsoft and the FTC point at the same behavior.** Guardrails: no problem counters / fake urgency / "issues found" dashboards (show neutral facts like "12 startup apps," never "47 errors detected!"); never require payment to "fix" a health problem (sell the shell experience, not a scare); everything opt-in and reversible; **code-sign**; no bundling/adware/behavior-change-under-AV; don't touch the registry "for cleaning."

**The credible measurement layer Alpine should build (the product *and* the legal shield).** Alpine has no measurement/baseline capture today. Metrics, all local/on-device (no server): **boot time** from Event ID 100 (`BootTime = MainPathBootTime + BootPostBootTime`; disclose the ~10s "settle to idle" overstatement; use the *delta*, median of N), **idle RAM** (`% Committed Bytes In Use` over a fixed idle window), **idle CPU** (`Processor(_Total)\% Processor Time`), **startup-item count** (extend `startupState.js`), **process/service count**, **storage type** (`Get-PhysicalDisk MediaType`). Methodology: capture a versioned baseline *before* any change, make one change set at a time with explicit consent recording exactly what changed, re-measure under identical conditions across **multiple reboots** and report **median + range**, report the delta with honest uncertainty, distinguish what you *measured* (changes you made) from what you *advise* (SSD/RAM/driver), and always offer one-click revert + re-measure. The hero feature is a locally-generated **"What we changed and measured" report** with a before/after table, an explicit **"What we did NOT change (advice only)"** section, inline caveats, Revert, Re-measure, and Export — proof not promise, FTC-substantiated by construction, with the anti-snake-oil signal baked in. Avoid invented composite "PC Health Scores," and gate any future telemetry behind a privacy policy + consent (prefer on-device).

### Alpine's Own Footprint

When Alpine replaces `explorer.exe`, its footprint is **permanent overhead** every user pays 24/7. explorer.exe idles around **100–300MB** with ~0% idle CPU — that is the bar, and **Alpine must beat it before shipping.** A lean Alpine *can* beat a loaded explorer.exe, but the current repo is not lean yet.

**What the code does at idle (verified):**
- **Two renderer processes per display** (`createShellForDisplay`, desktop + topbar BrowserWindows, ~150–250MB each). Electron's `affinity` was removed in v14 and same-origin windows **still each get their own renderer** with no supported merge flag — so a 2-monitor setup runs **4 renderers** + main + GPU/utility.
- **Multiple persistent PowerShell processes** (`volume.js`, `mediaSession.js`, `appActivator.js` each `spawn` a `-NoExit`/`-Sta` PS host, ~40–70MB each → **~120–200MB idle** before any polling).
- **Per-tick PowerShell *spawns* — the worst idle-CPU offender:** `openApps.js:174` every **2s**, `battery.js:39` every 10s, `microphone.js:38` every 3s, `network.js:185` every 10s, `topbarColor.js:253` every 5s, `brightness.js` every 15/60s. A cold `powershell.exe` is ~100–300ms CPU + ~30MB transient; the 2-second `openApps` poll alone is **~30 launches/minute, ~43,000/day** — the single biggest reason idle Alpine shows measurable CPU where explorer shows ~0%.
- **Main-process timers that never sleep:** a **50ms** cursor tracker per topbar (`main.js:139`), `foregroundColor.js:182` at 300ms, a 66ms volume peak meter (guarded), 1s volume/media polls, 1s dynamic-tiling timer — none throttle when idle or locked.
- **Renderers not throttled / untargeted broadcasts:** `backgroundThrottling:false` only on the screenshot window; every `broadcast()` fans out to *all* windows, waking desktop renderers for topbar-only events.

| Configuration | Realistic idle RAM | Idle CPU character |
|---|---|---|
| 1 monitor, as-is | ~300–450MB | periodic spikes from PS spawns every 2–3s |
| **2 monitors, as-is** | **~450–800MB** | same, plus 2× cursor trackers |
| explorer.exe baseline | 100–300MB | ~0% idle |

(For context, Discord/Teams idle near 1GB — Alpine isn't in that league, but it is currently *above* explorer.exe, which is what matters for a shell you sell.)

**Prioritized plan.** **Tier 1 (biggest wins):** (A) **kill all per-tick `powershell.exe` spawns** — generalize the existing `volume.js`/`mediaSession.js` queued-command pattern into one shared `psHost.js` and migrate openApps/battery/microphone/network/topbarColor/brightness onto it (removes ~40k launches/day; the highest-leverage change in the whole list). (B) **Replace polling with Windows event subscriptions** where they exist — openApps via the existing `tiling.js` WinEvent hook, battery via `WM_POWERBROADCAST`, network via `NetworkChange`, volume via the COM `IAudioEndpointVolumeCallback` (then delete the 1s poll), mediaSession via `GlobalSystemMediaTransportControlsSession` events. (C) **Reduce renderer count** — collapse desktop+topbar into one renderer per display, or lazy-create the desktop renderer only when a wallpaper is set. (D) **Slow/idle-gate main-process timers** — cursor tracker 50→100-120ms (or a top-edge-gated mouse hook), drive foregroundColor off `EVENT_SYSTEM_FOREGROUND`, and **suspend all polling while the session is locked or the display is off**.

**Tier 2:** enable `backgroundThrottling`, add startup flags (`Menu.setApplicationMenu(null)`, `spellcheck:false`, audit the GPU process), lazy-load the ~30 modules instead of starting all at boot, set `asar:true` explicitly + bundle main/preload with esbuild, and make `broadcast()` targeted. **Tier 3 (measure first):** V8 snapshot for the main process (cuts login-to-usable time — Alpine is on the login critical path — but brittle across upgrades); long-term, a native Win32/WinUI topbar if low-RAM machines still can't beat explorer.exe (the structural ~150–250MB/renderer Chromium tax is inherent — flag it as a known ceiling).

**Target idle numbers (release gate):** single monitor ≤**200MB** total private working set, **<0.5% idle CPU**; dual monitor ≤**300MB**, **<1% idle CPU**; near-zero when locked; **must be ≤ a fresh explorer.exe before shipping.** Measure before/after every change with **Process Explorer** (private bytes across the whole process tree — Task Manager hides that they're one app; watch the spawn-flash storm; goal is zero new processes at idle), and run a 24–48h leak/working-set drift check with a watchdog restart threshold. An automated CI budget gate should *enforce* these so the "lighter than explorer.exe" promise stays true across the frequent auto-updates.

---

## Part C — Honesty, Claims & Top Risks

### Claim ceiling — forbidden vs allowed language

Set a hard rule: **every quantitative claim must be either (a) a number *this user's machine* produced, or (b) a documented reproducible benchmark you hold *before* advertising.** Generic absolute promises are unsubstantiated and noise-prone.

| ❌ Forbidden (deceptive / unsubstantiated) | ✅ Allowed (specific, measured, hedged) |
|---|---|
| "Make your PC fast again" / "2x faster" / "X% faster" | "On this PC, boot-to-usable went from 48s to 31s after the changes you approved (median of 3 reboots)." |
| "Fix N problems / N errors detected" | "12 apps launch at startup; here are the 4 you may not need." |
| "Clean your registry to speed up Windows" / "Speeds up your internet" | (don't ship these features at all) |
| "Guaranteed performance boost" | "Results vary by hardware. We show you your own before/after numbers." |
| "Free up X GB of RAM" (hero number) | "Clear standby memory (advanced — only helps specific stutter cases; briefly slows app re-launches)." |
| "Lighter than explorer.exe" (today) | (true only *after* the footprint consolidation lands AND a CI budget gate enforces it) |

**The two enforcement facts to keep in front of you:** the **FTC's Restoro/Reimage $26M settlement (2024)** for misrepresenting "security or performance issues" (refunds of $25.5M paid to consumers in 2025), and **Paddle's $5M FTC settlement + permanent ban (June 2025)** from processing for merchants marketing on "computer security or performance" with pop-ups — making over-promised performance not just an FTC risk but a **payment-processor-rejection/termination risk** that can cut off your ability to sell entirely.

### Snake-oil exclusion list (permanent do-not-build)

Excluding these is itself a trust signal — surface an in-app "Why we don't include these" note:
- Registry cleaners (Microsoft-unsupported; can break the system).
- Generic RAM/memory boosters or scheduled working-set trims with a "freed X GB" graph (placebo-to-harmful — standby is a cache, not waste).
- Internet / TCP "accelerators" (outcome highly variable, can reduce throughput).
- SSD defrag (an HDD-era relic that wastes write cycles).
- Any "N problems found" / health-score / "errors detected" scan that precedes a paywall (the direct FTC + Defender-PUA trigger).
- System-wide timer-resolution tweaks marketed as a speed win (per-process since Win10 2004; near-zero cross-app benefit, costs laptop battery).
- SysMain-disable on SSD, page-file edits, raw min/max CPU% sliders, and **Realtime** process priority (system-destabilizing).

Honest framing for the legitimate features: market **debloat** as "tidier/cleaner," **telemetry** reduction as "minimized" (it's floored to "Required" on Home/Pro), **boot** gains "by storage type, measure across 2–3 cold boots," and **Snappy Mode** as "feels snappier" — not "faster hardware."

### Top 3 ship-blockers

Consolidated from both critics' `topThreeRisksToShipping`:

1. **The desktop-lockout chain is open end-to-end.** The crash-watchdog (proposed, not built), the Windows-feature-update Shell-reset self-heal (missing — `ensureShellRegistration()` only runs if Alpine launches), and the `userData`-only revert/undo journals (lost on reinstall) together mean a paying customer can still end up at a black screen with their recovery remedy unavailable. `setup.js` sets `AutoRestartShell=0` (line 91) and points `Winlogon\Shell` directly at the Electron exe (line 88) with no fallback. This is the existential, refund-and-liability-generating risk. **Blocking fixes:** stop disabling AutoRestartShell, ship a native supervising launcher with crash-loop backoff + explorer fallback, add a recovery hotkey that works when Alpine is dead, and the feature-update self-heal.

2. **There is no ability to sell or support yet — as an operational system.** No licensing/entitlement code, no MoR checkout, no safe-degrade revocation/refund behavior, no support channel, no externally-hosted recovery/status page, no diagnostics export — and no EULA/privacy/refund docs, plus the unlicensed bundled cursor + wallpapers. Even with the perfect EULA you cannot take money, cannot revoke safely, and cannot support a customer whose shell is down. The commercial machine is missing, not just the paywall — and the pieces are interdependent (any one missing blocks legal sale).

3. **Unsigned + AV/SmartScreen/Smart-App-Control friction on a Winlogon-rewriting binary — and signing is the true long pole for *this* founder.** Code signing is absent everywhere in the repo, and Azure Artifact Signing **may not be available to a Swiss individual** (Microsoft lists EU/UK orgs + US/CA individuals; Switzerland is in neither), so resolving it means standing up a Microsoft-validatable EU entity or buying a token/cloud-HSM OV cert (~$200–500/yr) — a multi-week identity task *plus* weeks of reputation accrual afterward. Compounded by no staged-rollout/beta channel and no automated perf/QA release gates, one bad auto-update or perf regression hits 100% of the login-critical install base at once. **This must start now.**

---

## Sources

De-duplicated across all 14 findings, grouped by topic. Repo ground-truth (`RELEASING.md`, `package.json`, the `electron/` modules) underpins every finding and is not re-listed per source.

### Code signing, SmartScreen & Smart App Control
1. SmartScreen reputation for Windows app developers — Microsoft Learn (updated May 2026; EV no longer bypasses SmartScreen) — https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
2. Artifact Signing (formerly Trusted Signing) — Pricing | Microsoft Azure — https://azure.microsoft.com/en-us/pricing/details/artifact-signing/
3. Code signing options for Windows app developers — Microsoft Learn — https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
4. Authenticode in 2025 – Azure Trusted Signing (Eric Lawrence, text/plain) — https://textslashplain.com/2025/03/12/authenticode-in-2025-azure-trusted-signing/
5. Reputation with OV vs EV certificates — Microsoft Q&A — https://learn.microsoft.com/en-us/answers/questions/417016/reputation-with-ov-certificates-and-are-ev-certifi
6. Signing Windows installers with OV — How long to get SmartScreen reputation? — JUCE forum — https://forum.juce.com/t/signing-windows-installers-with-ov-certificate-how-long-to-get-smartscreen-reputation/55245
7. Understanding Microsoft's Trusted Signing service | InfoWorld (Basic $9.99 / Premium $99.99) — https://www.infoworld.com/article/2337355/understanding-microsofts-trusted-signing-service.html
8. New Private-Key protection requirements (June 2023 FIPS 140-2 L2 / HSM mandate) | GlobalSign — https://support.globalsign.com/code-signing/advisory/new-requirements-related-private-key-protection-codesigning-certificates
9. Boot or Logon Autostart: Winlogon Helper DLL (T1547.004) | MITRE ATT&CK — https://attack.mitre.org/techniques/T1547/004/
10. Autoruns / Sysinternals — unsigned & Winlogon entries flagged | Microsoft Learn — https://learn.microsoft.com/en-us/sysinternals/downloads/autoruns
11. Trusted Signing now open for individual developers | Microsoft Community Hub — https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554
12. DigiCert / Sectigo EV Code Signing pricing (~$280–650/yr) — https://signmycode.com/digicert-ev-code-signing
13. Fighting through Setting up Microsoft Trusted Signing | Rick Strahl (3-day cert validity, timestamping) — https://weblog.west-wind.com/posts/2025/Jul/20/Fighting-through-Setting-up-Microsoft-Trusted-Signing
14. Code signing on Windows with Azure Trusted Signing | Melatonin (au10tix, eligibility) — https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/
15. Azure Trusted Signing short-lived cert / timestamp requirement — Microsoft Q&A — https://learn.microsoft.com/en-us/answers/questions/2202247/azure-trusted-signing-short-lived-certificate
16. Support for Azure Trusted Signing in electron-builder (#8276) | GitHub — https://github.com/electron-userland/electron-builder/issues/8276
17. Code Signing with Azure Trusted Signing on GitHub Actions | Hendrik Erz — https://hendrik-erz.de/post/code-signing-with-azure-trusted-signing-on-github-actions
18. electron-builder win.md — publisherName array & auto-update CN verification — https://github.com/electron-userland/electron-builder/blob/master/pages/win.md
19. Guide to upgrading code signing certificate + publisherName (#6499) | electron-builder — https://github.com/electron-userland/electron-builder/issues/6499

### Antivirus / Defender / PUA
20. Submit a file for malware analysis — Microsoft Security Intelligence (WDSI) — https://www.microsoft.com/en-us/wdsi/filesubmission
21. Microsoft Defender false positives — text/plain (Eric Lawrence) — https://textslashplain.com/2026/01/27/microsoft-defender-false-positives/
22. Threat Hunting: Encoded PowerShell (T1027.010 / AMSI / LOLBin) — https://kqlquery.com/posts/hunting-encoded-powershell/
23. ASAR native module unpacking triggers virus scanners — electron/electron #1205 — https://github.com/electron/electron/issues/1205
24. Auto Unpack Native Modules / electron-builder ASAR contents — https://www.electron.build/docs/contents/
25. Smart App Control overview (blocks unsigned/unknown apps) — Microsoft Learn — https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview
26. Smart App Control FAQ — Microsoft Support — https://support.microsoft.com/en-us/windows/smart-app-control-frequently-asked-questions-285ea03d-fa88-4d56-882e-6698afdb7003
27. Address false positives/negatives in Microsoft Defender for Endpoint — https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives
28. False-Positive-Center: per-vendor AV FP submission directory (GitHub) — https://github.com/yaronelh/False-Positive-Center
29. VirusTotal — "My file should not be detected" (no verdict; contact each vendor) — https://docs.virustotal.com/docs/false-positive
30. VirusTotal trusted-source / software-vendor allowlist program — PCWorld — https://www.pcworld.com/article/431848/virustotal-tackles-false-positive-malware-detections-plaguing-antivirus-and-software-vendors.html
31. Avast Threat Labs file whitelisting for developers — Avast Support — https://support.avast.com/en-gb/article/threat-lab-file-whitelist/

### Licensing & entitlement
32. Keygen — Pricing — https://keygen.sh/pricing/
33. Keygen — Offline licensing / cryptographic verification — https://keygen.sh/docs/choosing-a-licensing-model/offline-licenses/
34. Keygen — air-gapped activation example (signed license files) — https://github.com/keygen-sh/air-gapped-activation-example
35. Keygen — Self Hosting (CE / EE) — https://keygen.sh/docs/self-hosting/
36. Keygen — License & distribute Electron applications — https://keygen.sh/for-electron-apps/
37. Cryptolens — Pricing — https://cryptolens.io/pricing-int2/
38. LicenseSpring — Node-Locked Licensing — https://licensespring.com/software-licensing/node-locking
39. Source Code Protection — electron-vite — https://electron-vite.org/guide/source-code-protection
40. ASAR Integrity — Electron docs — https://www.electronjs.org/docs/latest/tutorial/asar-integrity
41. Lemon Squeezy — License API docs — https://docs.lemonsqueezy.com/api/license-api
42. Lemon Squeezy — Fees — https://docs.lemonsqueezy.com/help/getting-started/fees
43. Paddle — Migrate Classic to Billing (license-key fulfillment deprecated) — https://developer.paddle.com/migrate/paddle-classic/overview
44. Paddle — Classic-to-Billing migrations changelog (2025) — https://developer.paddle.com/changelog/2025/classic-to-billing-migrations
45. Paddle Forward: Fall 2025 product updates — https://www.paddle.com/blog/paddle-forward-november-2025-product-updates
46. node-machine-id — npm (Windows MachineGuid fingerprint) — https://www.npmjs.com/package/node-machine-id

### Payments & global tax
47. Lemon Squeezy — Payments, tax & subscriptions (MoR + license keys) — https://www.lemonsqueezy.com/
48. Lemon Squeezy — Merchant of Record overview — https://www.lemonsqueezy.com/reporting/merchant-of-record
49. Lemon Squeezy — Pricing — https://www.lemonsqueezy.com/pricing
50. Lemon Squeezy — Supported countries / getting paid (79 bank, 200+ PayPal) — https://docs.lemonsqueezy.com/help/getting-started/supported-countries
51. Stripe — Register for sales tax, VAT, GST (you remain liable) — https://docs.stripe.com/tax/registering
52. Stripe Tax — Pricing (Basic 0.5%/txn; Tax Complete CHF 80–1,300/mo) — https://stripe.com/tax/pricing
53. Paddle — MoR: Everything you need to know — https://www.paddle.com/paddle-101
54. Paddle — Which countries are supported (incl. Switzerland, CHF payouts) — https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle
55. Polar — Merchant of Record introduction ("Stripe is a PSP, not an MoR") — https://polar.sh/docs/merchant-of-record/introduction
56. Polar.sh — Pricing — https://polar.sh/resources/pricing
57. Switzerland VAT threshold & digital-services nil-threshold 2025 — VATupdate — https://www.vatupdate.com/2025/11/11/swiss-vat-rules-for-foreign-digital-service-providers-registration-compliance-and-key-thresholds-explained/
58. New E-commerce VAT Rules in Switzerland (1 Jan 2025) — Marosa VAT — https://marosavat.com/vat-news/new-e-commerce-vat-rules-by-2025-switzerland
59. Understanding Chargebacks with Paddle — Paddle Help — https://www.paddle.com/help/manage/risk-prevention/understanding-chargebacks-with-paddle
60. FTC: Paddle to pay $5M over MoR payment-processing allegations (June 2025) — https://www.ftc.gov/news-events/news/press-releases/2025/06/paddle-will-pay-5-million-settle-ftc-allegations-unfair-payment-processing-practices-facilitation
61. FastSpring — Pricing — https://fastspring.com/pricing/
62. Gumroad — Pricing (10% flat; MoR since 1 Jan 2025) — https://gumroad.com/pricing

### Legal & compliance
63. How to Write an EULA for Your Software — TermsFeed — https://www.termsfeed.com/blog/how-write-eula-software/
64. Apple Licensed Application End User License Agreement — https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
65. Draft Limitation or Exclusion of Liability Clauses — TermsFeed — https://www.termsfeed.com/blog/draft-limitation-exclusion-liability-clauses/
66. UCTA / Consumer Rights Act: limiting contractual liability (UK) — Lexology — https://www.lexology.com/library/detail.aspx?g=427d5deb-1f1a-4c42-ba74-187ebee0c781
67. The revised FADP compared to the EU GDPR — PwC Switzerland — https://www.pwc.ch/en/insights/regulation/fadp-comparison-gdpr.html
68. Swiss FADP Revisions Explained — Termly — https://termly.io/resources/articles/swiss-fadp/
69. Consumer info, right of withdrawal & other rights — EUR-Lex (CRD summary) — https://eur-lex.europa.eu/EN/legal-content/summary/consumer-information-right-of-withdrawal-and-other-consumer-rights.html
70. Returns and the right of withdrawal — Your Europe (EC) — https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm
71. Consolidated Directive 2011/83/EU (CRD, Art. 16(m), 8(7)) — EUR-Lex — https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02011L0083-20220528
72. New EU "Cancel Contract" Button Rule (Dir. 2023/2673) — https://www.internetandtechnologylaw.com/european-union-cancel-contract-button-rule-online-sales/
73. How Paddle handles VAT on your behalf — Paddle Help — https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf
74. Merchant of Record — Lemon Squeezy Docs — https://docs.lemonsqueezy.com/help/payments/merchant-of-record
75. EU VAT OSS in Switzerland — Commenda — https://www.commenda.io/switzerland/vat-one-stop-shop-oss
76. Refunds and Chargebacks — Lemon Squeezy Docs — https://docs.lemonsqueezy.com/help/payments/refunds-chargebacks
77. Lemon Squeezy vs Polar vs Paddle: MoR Comparison 2026 — BuildMVPFast — https://www.buildmvpfast.com/blog/lemon-squeezy-vs-polar-paddle-merchant-of-record-2026
78. Buyer Terms & Conditions — Lemon Squeezy — https://www.lemonsqueezy.com/buyer-terms
79. Terms/Privacy Policy Generator pricing — iubenda — https://www.iubenda.com/en/terms-and-conditions-generator/

### Reliability & crash safety
80. Native Crash Reporting | Sentry for Electron — https://docs.sentry.io/platforms/javascript/guides/electron/features/native-crash-reporting/
81. crashReporter | Electron Docs — https://www.electronjs.org/docs/latest/api/crash-reporter
82. crashReporter does not create minidump for abort() in native module on Windows (#36862) — https://github.com/electron/electron/issues/36862
83. Custom shell crash recovery (MSDN forum) — AutoRestartShell vs watchdog — https://social.msdn.microsoft.com/Forums/windowsserver/en-US/7fefce62-1246-4a7b-abac-745787b2b924/custom-shell-crash-recovery
84. Sentry Pricing — Free Developer Plan (5K errors), Team from $26/mo — https://sentry.io/pricing/
85. Electron crashes when restarting / app.relaunch issues (#22293) — https://github.com/electron/electron/issues/22293
86. Black screen, no shell — recover via Ctrl+Alt+Del → explorer.exe (Microsoft Q&A) — https://learn.microsoft.com/en-in/answers/questions/5544799/black-screen-(no-windows-ui)-with-only-the-mouse-c
87. Sentry Free (Developer) Plan 2026 — https://sentrypricing.com/free-plan
88. sentry-electron — official Sentry SDK (GitHub) — https://github.com/getsentry/sentry-electron
89. quitAndInstall closes all windows then quits — NsisUpdater (electron-builder docs) — https://www.electron.build/electron-updater.Class.NsisUpdater.html

### Bundled assets & dependency licensing
90. Moga Cursors for Windows by MOYASH77 (DeviantArt) — https://www.deviantart.com/moyash77/art/Moga-Cursors-for-Windows-1236140793
91. Moga Cursor for Windows (Free Version) (DeviantArt) — https://www.deviantart.com/moyash77/art/Moga-Cursor-for-Windows-Free-Version-1233560583
92. DeviantArt Copyright Policy — https://www.deviantart.com/about/policy/copyright/
93. Creative Commons on DeviantArt — Explained — https://www.deviantart.com/creative-commons/journal/Creative-Commons-on-DeviantArt-Explained-224551131
94. Unsplash License — https://unsplash.com/license
95. Unsplash License FAQs (Unsplash Blog) — https://medium.com/unsplash/the-unsplash-license-f6fb7de5c95a
96. Bibata_Cursor (ful1e5) — GPL-3.0 cursor set — https://github.com/ful1e5/Bibata_Cursor
97. RealWorld Cursor Editor licensing (free for commercial use) — https://www.rw-designer.com/cursor-license
98. CC0 Icons, Cursors, UI — OpenGameArt.org — https://opengameart.org/content/cc0-icons-cursors-ui
99. Electron LICENSE (MIT) and Chromium attribution — https://github.com/electron/electron/blob/main/LICENSE
100. FFmpeg License and Legal Considerations (LGPL notices, source-offer, patents) — https://www.ffmpeg.org/legal.html
101. Legal ramifications of using proprietary_codecs (electron/libchromiumcontent #174) — https://github.com/electron/libchromiumcontent/issues/174
102. electron-builder: non-proprietary FFmpeg download (#7210) — https://github.com/electron-userland/electron-builder/issues/7210
103. electron-packager-plugin-non-proprietary-codecs-ffmpeg — https://github.com/amilajack/electron-packager-plugin-non-proprietary-codecs-ffmpeg
104. generate-license-file — consolidated third-party license file — https://generate-license-file.js.org/
105. license-checker (npm) — https://www.npmjs.com/package/license-checker

### QA & Electron security hardening
106. Security | Electron (official checklist) — https://www.electronjs.org/docs/latest/tutorial/security
107. Electron Fuses | Electron — https://www.electronjs.org/docs/latest/tutorial/fuses
108. Process Sandboxing | Electron — https://www.electronjs.org/docs/latest/tutorial/sandbox
109. ASAR Integrity | Electron — https://www.electronjs.org/docs/latest/tutorial/asar-integrity
110. Configuring Electron Fuses | electron-builder — https://www.electron.build/tutorials/adding-electron-fuses.html
111. electron/fuses (GitHub) — fuse flags and defaults — https://github.com/electron/fuses
112. fix: apply CSP correctly (electron PR #37756) — https://github.com/electron/electron/pull/37756
113. Microsoft Windows lifecycle / end-of-support dates — https://endoflife.date/windows
114. Twinkle Tray / DDC-CI external monitor brightness issues — https://windowsforum.com/threads/twinkle-tray-control-external-monitor-brightness-on-windows-with-ddc-ci.388272/
115. Automated Testing | Electron (Playwright; Spectron deprecated) — https://www.electronjs.org/docs/latest/tutorial/automated-testing
116. Spectron Deprecation Notice | Electron — https://www.electronjs.org/blog/spectron-deprecation-notice

### Boot & startup
117. Windows 11 Fast Startup: Pros, Cons, How to Toggle — Windows Forum — https://windowsforum.com/threads/windows-11-fast-startup-pros-cons-and-how-to-toggle-it.383146/
118. Windows boot performance diagnostics, Part 1 (Event 100/101-110) — https://eventlogxp.com/blog/windows-boot-performance-diagnostics-1/
119. Diagnostics-Performance event 100 no longer logged (TenForums) — https://www.tenforums.com/performance-maintenance/170313-diagnostics-performance-event-100-boot-duration-no-longer-logged.html
120. How to Delay Startup Programs on Windows 11 & 10 (WindowsLoop) — https://windowsloop.com/delay-startup-programs-with-task-scheduler/
121. Windows already logs why your PC starts up slowly (MakeUseOf) — https://www.makeuseof.com/windows-already-logs-why-pc-starts-up-slowly-check-it/
122. Safe Windows Service Tuning in 2026 (Windows News) — https://windowsnews.ai/article/safe-windows-service-tuning-in-2026-which-to-disable-and-which-to-configure.419221
123. Windows 11 still runs dinosaur services like Fax (MakeUseOf) — https://www.makeuseof.com/disable-unnecessary-windows-11-startup-services/
124. 4 Windows services safe to disable (and 3 you never should) (MakeUseOf) — https://www.makeuseof.com/turn-off-these-useless-windows-services/
125. How to Disable Fast Startup in Windows 11 (How2Shout) — https://www.how2shout.com/how-to/disable-fast-startup-in-windows-11.html
126. Checkpoint-Computer — Microsoft Learn — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/checkpoint-computer?view=powershell-5.1
127. Can't create system restore point with non-admin (Tom's Hardware) — https://forums.tomshardware.com/threads/cant-create-system-restore-point-in-powershell-with-non-admin-credentials-on-windows-10-machines.3448835/
128. Evaluate Fast Startup Using Windows Performance Toolkit — Microsoft Learn — https://learn.microsoft.com/en-us/windows-hardware/test/wpt/optimizing-performance-and-responsiveness-exercise-2
129. How to Analyze Windows Boot Performance with xbootmgr — https://teamsbackground.net/how-to-analyze-windows-boot-performance-with-xbootmgr/
130. FREE: BootRacer – Measure boot speed (4sysops) — https://4sysops.com/archives/free-bootracer-measure-boot-speed/

### Debloat
131. App Removal — Raphire/Win11Debloat Wiki — https://github.com/Raphire/Win11Debloat/wiki/App-Removal
132. Win11 Debloat Tools Tested: Small Gains, Big Risks — Windows Forum — https://windowsforum.com/threads/windows-11-debloat-tools-tested-small-gains-big-risks-tiny11-more.412345/
133. How to reinstall a Windows Store app after uninstalling — Microsoft Q&A — https://learn.microsoft.com/en-us/answers/questions/1351764/how-to-reinstall-windows-store-app-after-uninstall
134. Permanently remove WebView2 (WebView2 is critical) — Microsoft Q&A — https://learn.microsoft.com/en-us/answers/questions/4126351/permanently-remove-webview2-and-stop-it-from-reins
135. O&O ShutUp10++ (recommended/green privacy settings) — https://www.oo-software.com/en/shutup10
136. Policy-based in-box app removal (RemoveDefaultMicrosoftStorePackages, ENT/EDU 24H2) — Microsoft Learn — https://learn.microsoft.com/en-us/windows/configuration/policy-based-inbox-app-removal/policy-based-inbox-app-removal
137. Win11Debloat README (Edge/Store/Sandbox warnings) — https://github.com/Raphire/Win11Debloat
138. Force Lower Windows 11 Telemetry (AllowTelemetry; floored on Home/Pro) — Windows Forum — https://windowsforum.com/threads/force-lower-windows-11-telemetry-with-registry-policy-allowtelemetry-guide.411934/
139. Configure Windows diagnostic data (telemetry levels by edition) — Microsoft Learn — https://learn.microsoft.com/en-us/windows/privacy/configure-windows-diagnostic-data-in-your-organization
140. Which AppxPackage can be removed safely (do-not-remove list) — Microsoft Learn — https://learn.microsoft.com/en-us/archive/msdn-technet-forums/10740522-6c7e-4664-bc5e-f638467aae5d
141. How to Disable DiagTrack (reversible, caveats) — MajorGeeks — https://www.majorgeeks.com/content/page/how_to_disable_diagnostics_tracking_(diagtrack)_or_connected_user_experiences_and_telemetry.html
142. Disable Windows 11 Telemetry DiagTrack (re-enabled by updates) — Windows Forum — https://windowsforum.com/threads/disable-windows-11-telemetry-diagtrack-for-privacy-and-a-quieter-pc.400259/
143. Enable/Disable Background Apps in Windows 11 (GlobalUserDisabled) — Eleven Forum — https://www.elevenforum.com/t/enable-or-disable-background-apps-in-windows-11.923/
144. Remove-AppxProvisionedPackage / Remove-AppxPackage (per-user vs provisioned) — Microsoft Learn — https://learn.microsoft.com/en-us/powershell/module/dism/remove-appxprovisionedpackage?view=windowsserver2025-ps

### Runtime CPU/GPU/memory tuning
145. Understanding Windows Power Plans (WiseCleaner) — https://www.wisecleaner.com/think-tank/766-Understanding-Windows-Power-Plans-Balanced-Battery-Saver-High-Performance-and-Ultimate-Performance.html
146. Change the power mode for your Windows PC — Microsoft Support — https://support.microsoft.com/en-us/windows/change-the-power-mode-for-your-windows-pc-c2aff038-22c9-f46d-5ca0-78696fdf2de8
147. Minimum Processor State 5/0/1/100/99% (MiniTool) — https://www.minitool.com/lib/minimum-processor-state.html
148. Appropriate page file size for 64-bit Windows — Microsoft Learn — https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/how-to-determine-the-appropriate-page-file-size-for-64-bit-versions-of-windows
149. Scheduling Priorities — Win32 apps (Microsoft Learn) — https://learn.microsoft.com/en-us/windows/win32/procthread/scheduling-priorities
150. Your Windows power plan is probably wrong (XDA) — https://www.xda-developers.com/your-windows-power-plan-is-probably-wrong/
151. Hardware Accelerated GPU Scheduling: The 2025-2026 Truth — https://www.techbusinessnews.com.au/hardware-accelerated-gpu-scheduling-the-2025-2026-truth-nobodys-telling-you/
152. Windows Game Mode On or Off — What Actually Helps in 2026 — https://superstarreviews.tech/windows-game-mode/
153. SysMain (Superfetch): Optimize or Disable — Windows Forum — https://windowsforum.com/threads/sysmain-superfetch-in-windows-optimize-or-disable-for-better-performance.363969/
154. 5 Best RAM Cleaners — on the placebo effect (TechYorker) — https://techyorker.com/5-best-ram-cleaners-optimizers-for-windows-10-11/
155. RAMMap — Sysinternals (Empty Working Sets / Standby List) — https://learn.microsoft.com/en-us/sysinternals/downloads/rammap
156. Intelligent Standby List Cleaner (ISLC): Fix Memory Stuttering — https://pcgamingtools.com/intelligent-standby-list-cleaner-islc-download/
157. Paging File: System managed or Custom Sized (Eleven Forum) — https://www.elevenforum.com/t/paging-file-in-windows-11-system-managed-or-custom-sized.453/
158. Real-time priority — what you asked for (The Old New Thing) — https://devblogs.microsoft.com/oldnewthing/20100610-00/?p=13753
159. Fix for Ultimate Performance plan "not working" — duplicatescheme returns new GUID — https://github.com/memstechtips/UnattendedWinstall/discussions/101

### Perceived responsiveness / Snappy Mode
160. Response Times: The 3 Important Limits — Nielsen / NN/g — https://www.nngroup.com/articles/response-times-3-important-limits/
161. Electron Performance (official docs) — https://www.electronjs.org/docs/latest/tutorial/performance
162. Turn On or Off Animation Effects in Windows 11 (UserPreferencesMask + MinAnimate) — https://www.elevenforum.com/t/turn-on-or-off-animation-effects-in-windows-11.1461/
163. Change Menu Show Delay Time (default 400ms) — https://www.tenforums.com/tutorials/14428-change-menu-show-delay-time-windows-10-a.html
164. How to disable transparency effects on Windows 11 (EnableTransparency) — https://www.windowscentral.com/how-disable-transparency-effects-windows-11
165. SystemParametersInfoA — SPI_SET* flags, SPIF_UPDATEINIFILE/SPIF_SENDCHANGE — Microsoft Learn — https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfoa
166. Client area animation parameter (SPI_SETCLIENTAREAANIMATION) — Microsoft Learn — https://learn.microsoft.com/en-us/windows/win32/winauto/client-area-animation
167. UserPreferencesMask bit/flag reference — https://j.jgs.im/tech/windows/userpreferencesmask
168. Change Visual Effects Settings (best-performance byte values) — https://www.tenforums.com/tutorials/6377-change-visual-effects-settings-windows-10-a-2.html
169. Disable Display Mode Change Animation / DWM (Winaero) — https://winaero.com/display-change-animation/
170. VisualFXSetting values 0/1/2/3 (may not flip effects alone) — https://www.tenforums.com/tutorials/6377-change-visual-effects-settings-windows-10-a-4.html
171. Change HungAppTimeout / WaitToKillAppTimeout — https://www.tenforums.com/tutorials/97842-change-hungapptimeout-value-windows-10-a.html
172. Timer Resolution: Does It Actually Boost FPS? (2026) — https://www.sagetweaks.com/blog/timer-resolution-fps-improvement-explained
173. Windows Timer Resolution: The Great Rule Change — Bruce Dawson (per-process since Win10 2004) — https://randomascii.wordpress.com/2020/10/04/windows-timer-resolution-the-great-rule-change/
174. Architecting Electron Applications for 60fps — Nearform — https://nearform.com/insights/architecting-electron-applications-for-60fps/

### Honesty, claims & measurement (FTC/PUA)
175. HP — Speed Up Your Computer in 2025 — https://www.hp.com/us-en/shop/tech-takes/how-to-speed-up-computer
176. Malwarebytes Labs — Registry Cleaners: Digital Snake Oil — https://www.malwarebytes.com/blog/news/2015/06/digital-snake-oil
177. Microsoft — Support policy for registry cleaning utilities — https://support.microsoft.com/en-us/topic/microsoft-support-policy-for-the-use-of-registry-cleaning-utilities-0485f4df-9520-3691-2461-7b0fd54e8b3a
178. FTC — Tech Support Firms (Restoro/Reimage) Pay $26M to Settle (2024) — https://www.ftc.gov/news-events/news/press-releases/2024/03/tech-support-firms-will-pay-26-million-settle-ftc-charges-they-deceived-consumers-buying-repair
179. FTC — Restoro-Reimage refunds: $25.5M to consumers (2025) — https://www.ftc.gov/news-events/news/press-releases/2025/03/ftc-sends-more-255-million-consumers-impacted-tech-support-firms-scam
180. Event ID 100: Windows Diagnostics Performance — Microsoft Learn — https://learn.microsoft.com/en-us/archive/technet-wiki/11559.event-id-100-windows-diagnostics-performance
181. Debloat Windows: idle RAM/CPU & startup benchmarks — Windows Forum — https://windowsforum.com/threads/debloat-windows-remove-bloatware-for-speed-storage-and-privacy.394860/
182. GPU driver & thermal throttling / power-plan impact — SmoothFPS — https://smoothfps.com/guides/thermal-throttling
183. FTC — Advertising Substantiation Principles — https://www.ftc.gov/sites/default/files/attachments/training-materials/substantiation.pdf
184. FTC — Notices of Penalty Offenses (~$50k+/violation) — https://www.ftc.gov/enforcement/penalty-offenses
185. Block potentially unwanted applications with Defender (PUA, block mode) — Microsoft Learn — https://learn.microsoft.com/en-us/defender-endpoint/detect-block-potentially-unwanted-apps-microsoft-defender-antivirus
186. How Microsoft identifies malware and PUAs ("exaggerated claims … require payment") — Microsoft Learn — https://learn.microsoft.com/en-us/unified-secops-platform/criteria
187. UL Solutions — PCMark 10 reproducibility (~3% on stable systems) — https://benchmarks.ul.com/pcmark10

### Alpine's own footprint
188. Windows Latest — Electron apps using more RAM (Discord/Teams ~1GB idle) — https://www.windowslatest.com/2025/12/07/ram-prices-soar-but-popular-windows-11-apps-are-using-more-ram-due-to-electron-web-components/
189. Multiple Windows in Electron apps (~150–250MB each; affinity) — https://blog.bloomca.me/2025/07/21/multi-window-in-electron.html
190. Electron — Performance tutorial (audit requires, lazy-load, setApplicationMenu(null)) — https://www.electronjs.org/docs/latest/tutorial/performance
191. electron PR #26874 — remove BrowserWindow affinity (removed in v14) — https://github.com/electron/electron/pull/26874
192. Windows 11 explorer.exe idle memory ~100–300MB & leak drift — Microsoft Tech Community — https://techcommunity.microsoft.com/discussions/windows11/windows-explorer-memory-usage-normal/4230595
193. electron Issue #49960 — same-origin renderer reuse not supported — https://github.com/electron/electron/issues/49960
194. Electron Breaking Changes (affinity / allowRendererProcessReuse removal) — https://www.electronjs.org/docs/latest/breaking-changes
195. electron-snapshot-experiment — V8 snapshots in the main process — https://github.com/RaisinTen/electron-snapshot-experiment
196. How to make your Electron app launch 1,000ms faster (V8 snapshots) — https://www.devas.life/how-to-make-your-electron-app-launch-1000ms-faster/
