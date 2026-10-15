import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type WheelEvent } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import PopupMenu from "./shared/popupMenu";
import DesktopsFace, { DESKTOP_ID_ATTRIBUTE } from "./faces/desktopsFace";
import { useDarkText } from "../themeContext";
import { useDesktops } from "../../hooks/useDesktops";

const WHEEL_STEP_COOLDOWN_MS = 220;

function adjacentDesktopId(state: VirtualDesktopsState, step: number): string | null {
    const index = state.desktops.findIndex((desktop) => desktop.id === state.currentId);
    return state.desktops[index + step]?.id ?? null;
}

function happenedOnTheBar(event: MouseEvent | WheelEvent): boolean {
    return (event.currentTarget as HTMLElement).contains(event.target as Node);
}

function windowCountLabel(count: number): string {
    return count === 1 ? "1 window" : `${count} windows`;
}

function menuColors(darkText: boolean) {
    return darkText
        ? { text: "text-black/80", strong: "text-black", dim: "text-black/45", hover: "hover:bg-black/10", current: "bg-black/[0.07]", input: "bg-black/10 text-black", icon: "text-black/45 hover:text-black hover:bg-black/10" }
        : { text: "text-white/80", strong: "text-white", dim: "text-white/45", hover: "hover:bg-white/10", current: "bg-white/[0.07]", input: "bg-white/10 text-white", icon: "text-white/45 hover:text-white hover:bg-white/10" };
}

function DesktopRow({ desktop, index, current, canRemove, darkText }: { desktop: VirtualDesktop; index: number; current: boolean; canRemove: boolean; darkText: boolean }) {
    const colors = menuColors(darkText);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(desktop.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    function startEditing(event: MouseEvent) {
        event.stopPropagation();
        setDraft(desktop.name);
        setEditing(true);
    }

    function commit() {
        setEditing(false);
        if (draft.trim() !== desktop.name) window.shell.desktops.rename(desktop.id, draft).catch(() => {});
    }

    function handleKey(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") setEditing(false);
    }

    function remove(event: MouseEvent) {
        event.stopPropagation();
        window.shell.desktops.remove(desktop.id).catch(() => {});
    }

    return (
        <div
            role="button"
            tabIndex={0}
            aria-current={current ? "true" : undefined}
            onClick={() => { if (!editing && !current) window.shell.desktops.switchTo(desktop.id).catch(() => {}); }}
            onDoubleClick={startEditing}
            className={`group flex items-center gap-2.5 w-full h-8 pl-2 pr-1 rounded-md text-[12px] transition-colors cursor-pointer ${current ? colors.current : colors.hover}`}
        >
            <span className={`w-3 shrink-0 text-center tabular-nums text-[11px] ${current ? colors.strong : colors.dim}`}>{index + 1}</span>
            <span className="flex-1 min-w-0 flex flex-col leading-tight">
                {editing ? (
                    <input
                        ref={inputRef}
                        value={draft}
                        maxLength={32}
                        aria-label="Desktop name"
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleKey}
                        onBlur={commit}
                        onClick={(event) => event.stopPropagation()}
                        className={`w-full rounded px-1 -mx-1 outline-none ${colors.input}`}
                    />
                ) : (
                    <span className={`truncate ${current ? colors.strong : colors.text}`}>{desktop.name}</span>
                )}
                <span className={`text-[10px] ${colors.dim}`}>{windowCountLabel(desktop.windowCount)}</span>
            </span>
            {current && !editing && <Check size={12} className={`shrink-0 ${colors.strong} group-hover:hidden`} />}
            <span className="hidden group-hover:flex items-center gap-0.5">
                <button type="button" aria-label={`Rename ${desktop.name}`} onClick={startEditing} className={`flex items-center justify-center w-5 h-5 rounded cursor-pointer ${colors.icon}`}>
                    <Pencil size={11} />
                </button>
                {canRemove && (
                    <button type="button" aria-label={`Close ${desktop.name}`} onClick={remove} className={`flex items-center justify-center w-5 h-5 rounded cursor-pointer ${colors.icon}`}>
                        <X size={12} />
                    </button>
                )}
            </span>
        </div>
    );
}

function DesktopsMenu({ state, darkText }: { state: VirtualDesktopsState; darkText: boolean }) {
    const colors = menuColors(darkText);

    useEffect(() => {
        window.shell.desktops.refresh().catch(() => {});
    }, []);

    return (
        <div className="p-1.5 flex flex-col gap-0.5 w-52 shadow-2xl">
            {state.desktops.map((desktop, index) => (
                <DesktopRow
                    key={desktop.id}
                    desktop={desktop}
                    index={index}
                    current={desktop.id === state.currentId}
                    canRemove={state.desktops.length > 1}
                    darkText={darkText}
                />
            ))}
            <button
                type="button"
                disabled={!state.canCreate}
                onClick={() => window.shell.desktops.create().catch(() => {})}
                className={`flex items-center gap-2.5 w-full h-7 px-2 mt-0.5 rounded-md text-[12px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${colors.text} ${colors.hover}`}
            >
                <Plus size={12} className="w-3 shrink-0" />
                <span>New desktop</span>
            </button>
        </div>
    );
}

export default function DesktopsStatus() {
    const darkText = useDarkText();
    const state = useDesktops();
    const lastWheelStep = useRef(0);

    function pickDot(event: MouseEvent) {
        if (!happenedOnTheBar(event)) return;
        const dot = (event.target as HTMLElement).closest(`[${DESKTOP_ID_ATTRIBUTE}]`);
        const id = dot?.getAttribute(DESKTOP_ID_ATTRIBUTE);
        if (id && id !== state.currentId) window.shell.desktops.switchTo(id).catch(() => {});
    }

    function stepWithWheel(event: WheelEvent) {
        const now = Date.now();
        if (!happenedOnTheBar(event) || event.deltaY === 0 || now - lastWheelStep.current < WHEEL_STEP_COOLDOWN_MS) return;
        const id = adjacentDesktopId(state, event.deltaY > 0 ? 1 : -1);
        if (!id) return;
        lastWheelStep.current = now;
        window.shell.desktops.switchTo(id).catch(() => {});
    }

    return (
        <div className="flex self-stretch" onClick={pickDot} onWheel={stepWithWheel}>
            <PopupMenu trigger={<DesktopsFace desktops={state.desktops} currentId={state.currentId} darkText={darkText} />}>
                <DesktopsMenu state={state} darkText={darkText} />
            </PopupMenu>
        </div>
    );
}
