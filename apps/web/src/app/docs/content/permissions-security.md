# Permissions & the security model

Alpine Shell plugins declare exactly what they need in the `permissions` array of their [manifest](/docs/manifest-reference). Every token is drawn from a fixed allowlist, and each maps to a **risk tier** that drives the risk badges and the per-permission rows you review on a plugin's marketplace page before you install.

> **Curated model today.** Every plugin — official or custom — runs in-process with the shell's full privileges. There is no runtime sandbox yet. The marketplace lists **official, first-party plugins only**; a custom plugin you drop in runs with the same full privileges, so only sideload ones you wrote or reviewed.

## The permission tiers

| Tier | Consent | Examples |
|---|---|---|
| **Auto** | None | `storage`, `clock`, `theme` |
| **Read** | Shown at install | `read:volume`, `read:battery`, `read:media`, `read:network`, `read:system-info`, `net:fetch`, `location:coarse`, `notifications` |
| **Control** | Shown at install | `control:volume`, `control:brightness`, `control:media`, `control:wallpaper`, `control:windows` |
| **Sensitive** | Confirmed at install **and** just-in-time on each use | `control:power`, `control:network`, `control:bluetooth`, `launch:apps` |
| **Backend** | First-party only | `node` |

### Auto

No consent needed. `storage` gives a plugin private key/value storage; `clock` and `theme` are read-only reads of the time and the topbar appearance. These can't touch anything outside the plugin.

### Read

The plugin can *read* a piece of system state, or reach the network. `net:fetch` is special: you must pair it with the HTTPS origins you list in `network.connect`, cross-checked when the manifest loads. Under the future sandbox (Tier B) those origins pin the plugin's CSP `connect-src` so it can't reach a host it didn't declare. Today, in-process (Tier A), that boundary isn't enforced at runtime yet — the list is a declaration you're trusting the curated catalog to honor, not a hard limit.

### Control

The plugin can *change* a setting — volume, brightness, wallpaper, window layout. Shown clearly at install so you know what you're granting.

### Sensitive

Power actions, joining Wi-Fi networks, launching apps. These are marked `confirm` so the shell can flag them prominently before you install and, under the sandbox, prompt again just-in-time each time the plugin invokes them. That runtime prompt isn't wired yet (Tier A) — today the flag drives the high-risk badges you review before installing. `control:network` is gated until the safe-network capability lands.

### Backend (`node`)

Running a background Node process is the highest-trust grant. It is **reserved for first-party plugins** and is inert until code signing and the backend supervisor ship.

## The data-flow warning

If a plugin holds **any** read permission *and* declares network hosts, the marketplace and consent dialog show a data-flow line: *"This plugin can send data it reads to `api.example.com`."* This is the combination worth pausing on — a plugin that can read your state and also phone home. The permissions section on each plugin page surfaces this explicitly.

## The FORBIDDEN class

Some capabilities are simply not offered to plugins — arbitrary filesystem access, raw child-process spawning outside the `node` grant, reading other plugins' storage, and anything that would let a plugin escalate out of its declared surface. These are not on the allowlist, so a manifest that requests them has the unknown token dropped and reported; a plugin cannot smuggle them in.

## Tier A vs Tier B

- **Tier A (today):** the plugin runs in-process with full privileges. Trust is established by curation — the human-controlled catalog only lists official, first-party plugins. This is why the marketplace is first-party only, and why you should only sideload custom plugins you've written or reviewed.
- **Tier B (future):** untrusted plugins run in an isolated sandbox with capabilities brokered through audited adapters. Until that lands, the badges and the curated catalog are the guarantee.

## How this shows up on the marketplace

Every plugin's detail page renders **one row per requested permission** with its human label, its risk badge and the author's per-permission rationale. If a plugin lists a token the shell doesn't recognize, it is shown with an **Unknown** badge rather than hidden — a security surface must fail loud. This page is the public face of those badges: read it, then read the permissions before you click Install.
