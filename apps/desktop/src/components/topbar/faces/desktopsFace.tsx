export const DESKTOP_ID_ATTRIBUTE = "data-desktop-id";

const MIN_WINDOW_PX = 2;

function percent(fraction: number): string {
    return `${fraction * 100}%`;
}

function palette(darkText: boolean) {
    return darkText
        ? {
              pill: "border-black/20 bg-black/[0.04]",
              name: "text-black/85",
              screen: "border-black/25 hover:border-black/50",
              currentScreen: "border-black/80 bg-black/10",
              window: "bg-black/35",
              currentWindow: "bg-black/75",
              windowEdge: "0 0 0 0.5px rgba(255,255,255,0.7)",
          }
        : {
              pill: "border-white/25 bg-white/[0.06]",
              name: "text-white/90",
              screen: "border-white/30 hover:border-white/60",
              currentScreen: "border-white/90 bg-white/15",
              window: "bg-white/40",
              currentWindow: "bg-white/85",
              windowEdge: "0 0 0 0.5px rgba(0,0,0,0.55)",
          };
}

function MiniScreen({ desktop, current, darkText }: { desktop: VirtualDesktop; current: boolean; darkText: boolean }) {
    const colors = palette(darkText);
    return (
        <span
            {...{ [DESKTOP_ID_ATTRIBUTE]: desktop.id }}
            aria-current={current ? "true" : undefined}
            aria-label={desktop.name}
            className="flex items-center h-5 px-px"
        >
            <span
                className={`relative block w-5.5 h-3.25 rounded-[3px] border overflow-hidden transition-colors duration-300 ${current ? colors.currentScreen : colors.screen}`}
            >
                {desktop.windows.map((shape, index) => (
                    <span
                        key={index}
                        className={`absolute rounded-[1px] ${current ? colors.currentWindow : colors.window}`}
                        style={{
                            left: percent(shape.x),
                            top: percent(shape.y),
                            width: `max(${MIN_WINDOW_PX}px, ${percent(shape.width)})`,
                            height: `max(${MIN_WINDOW_PX}px, ${percent(shape.height)})`,
                            boxShadow: colors.windowEdge,
                        }}
                    />
                ))}
            </span>
        </span>
    );
}

export default function DesktopsFace({ desktops, currentId, darkText }: DesktopsFaceProps) {
    const colors = palette(darkText);
    const current = desktops.find((desktop) => desktop.id === currentId);
    return (
        <div className="flex items-center h-5 px-1">
            <div
                role="group"
                aria-label="Desktops"
                className={`flex items-center h-4.5 gap-0.5 pl-1 pr-2 rounded-full border transition-colors duration-300 ${colors.pill}`}
            >
                {desktops.map((desktop) => (
                    <MiniScreen key={desktop.id} desktop={desktop} current={desktop.id === currentId} darkText={darkText} />
                ))}
                {current && <span className={`ml-1 max-w-24 truncate text-[11px] font-medium leading-none ${colors.name}`}>{current.name}</span>}
            </div>
        </div>
    );
}
