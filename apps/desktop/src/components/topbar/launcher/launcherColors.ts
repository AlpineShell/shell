const DARK_TEXT: LauncherColors = {
  text: "text-black",
  dim: "text-black/50",
  faint: "text-black/25",
  icon: "text-black/40",
  hover: "hover:bg-black/5",
  selected: "bg-black/10",
  divider: "bg-black/10",
  softDivider: "bg-black/5",
  placeholder: "placeholder:text-black/40",
  chip: "bg-black/[0.07] text-black/55",
  badgeBackground: "rgba(255,255,255,0.95)",
  iconStroke: "black",
  iconStrokeDim: "rgba(0,0,0,0.5)",
}

const LIGHT_TEXT: LauncherColors = {
  text: "text-white",
  dim: "text-white/50",
  faint: "text-white/25",
  icon: "text-white/40",
  hover: "hover:bg-white/5",
  selected: "bg-white/10",
  divider: "bg-white/10",
  softDivider: "bg-white/5",
  placeholder: "placeholder:text-white/40",
  chip: "bg-white/10 text-white/60",
  badgeBackground: "rgba(24,24,27,0.95)",
  iconStroke: "white",
  iconStrokeDim: "rgba(255,255,255,0.5)",
}

export function launcherColors(darkText: boolean): LauncherColors {
  return darkText ? DARK_TEXT : LIGHT_TEXT
}
