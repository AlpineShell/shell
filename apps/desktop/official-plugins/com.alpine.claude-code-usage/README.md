# Claude Code Usage

Shows your **Claude Code subscription usage** as a compact bar in the Alpine Shell
topbar (left of the clock, right of the power menu), colored **white → orange → red**
as you approach a limit. Hover for a breakdown of every window — **Session (5h)**,
**Weekly**, and per-model — each with its percentage and reset countdown.

The data is the same the `/usage` command shows, read live by the shell from your
local Claude Code login. This widget just renders it — it makes no network calls and
requests **no special permissions**.

## Requirements

Alpine Shell provides the `claude-usage` data channel (from the bundled Claude
usage module), so this plugin works out of the box once installed — no setup.
