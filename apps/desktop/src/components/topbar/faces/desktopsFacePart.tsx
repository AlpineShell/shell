import type { MouseEvent } from "react";

const MIDDLE_BUTTON = 1;

function onMiddleButton(action: (() => void) | undefined) {
    return (event: MouseEvent) => {
        if (event.button !== MIDDLE_BUTTON || !action) return;
        event.preventDefault();
        if (event.type === "auxclick") action();
    };
}

export default function DesktopsFacePart({ label, className, onPress, onMiddlePress, children }: DesktopsFacePartProps) {
    if (!onPress) return <span className={className}>{children}</span>;
    return (
        <button
            aria-label={label}
            onClick={onPress}
            onMouseDown={onMiddleButton(onMiddlePress)}
            onAuxClick={onMiddleButton(onMiddlePress)}
            className={`${className} cursor-pointer`}
        >
            {children}
        </button>
    );
}
