export interface AliasRule {
  match: string | RegExp
  terms: string[]
}

export const launcherAliases: AliasRule[] = [
  { match: "visual studio code", terms: ["vscode", "vsc", "code editor"] },
  { match: /\bvisual studio\b(?! code)/, terms: ["vs", "visualstudio", "devenv"] },
  { match: "photoshop", terms: ["ps", "photo shop"] },
  { match: "illustrator", terms: ["ai", "illus"] },
  { match: "premiere pro", terms: ["pr", "premiere"] },
  { match: "after effects", terms: ["ae", "aftereffects"] },
  { match: "acrobat", terms: ["pdf", "adobe pdf", "acro"] },
  { match: "microsoft word", terms: ["word", "winword", "doc"] },
  { match: "microsoft excel", terms: ["excel", "xls", "spreadsheet"] },
  { match: "microsoft powerpoint", terms: ["powerpoint", "ppt", "slides"] },
  { match: "microsoft outlook", terms: ["outlook", "mail", "email"] },
  { match: "microsoft teams", terms: ["teams"] },
  { match: "microsoft onenote", terms: ["onenote", "notes"] },
  { match: /\bedge\b/, terms: ["edge", "browser", "msedge"] },
  { match: "google chrome", terms: ["chrome", "browser", "gchrome"] },
  { match: "firefox", terms: ["ff", "firefox", "browser"] },
  { match: "command prompt", terms: ["cmd", "command", "terminal"] },
  { match: "windows powershell", terms: ["powershell", "pwsh", "ps1", "shell"] },
  { match: "windows terminal", terms: ["terminal", "wt", "term"] },
  { match: "file explorer", terms: ["explorer", "files", "filemanager"] },
  { match: "task manager", terms: ["taskmgr", "tasks", "processes"] },
  { match: "control panel", terms: ["control", "cpl"] },
  { match: "calculator", terms: ["calc"] },
  { match: "snipping tool", terms: ["snip", "screenshot", "screen shot"] },
  { match: "spotify", terms: ["music"] },
  { match: "discord", terms: ["chat", "dc"] },
  { match: "slack", terms: ["slk"] },
  { match: /\bgit\s?hub desktop\b/, terms: ["github", "ghd"] },
  { match: "docker desktop", terms: ["docker"] },
  { match: "notepad++", terms: ["notepadpp", "npp"] },
  { match: "steam", terms: ["games"] },
  { match: "obs studio", terms: ["obs", "streaming", "recorder"] },
]
