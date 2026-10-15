export const DESKTOP_ID_ATTRIBUTE = "data-desktop-id";

function dotClass(current: boolean, darkText: boolean): string {
    if (current) return `w-4 ${darkText ? "bg-black/85" : "bg-white/90"}`;
    return `w-1.5 ${darkText ? "bg-black/30 group-hover/dot:bg-black/55" : "bg-white/35 group-hover/dot:bg-white/60"}`;
}

export default function DesktopsFace({ desktops, currentId, darkText }: DesktopsFaceProps) {
    return (
        <div className="flex items-center h-5 px-1.5" role="group" aria-label="Desktops">
            {desktops.map((desktop) => {
                const current = desktop.id === currentId;
                return (
                    <span
                        key={desktop.id}
                        {...{ [DESKTOP_ID_ATTRIBUTE]: desktop.id }}
                        aria-current={current ? "true" : undefined}
                        aria-label={desktop.name}
                        className="group/dot flex items-center h-5 px-0.5"
                    >
                        <span className={`block h-1.5 rounded-full transition-all duration-300 ease-out ${dotClass(current, darkText)}`} />
                    </span>
                );
            })}
        </div>
    );
}
