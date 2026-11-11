import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SystemTray from "./systemTray";
import { setChromeSurface } from "./chrome/chromeStore";

const TEAMS = trayIcon("teams", "Teams");
const DROPBOX = trayIcon("dropbox", "Dropbox");
const ONEDRIVE = trayIcon("onedrive", "OneDrive");
const STORED_LAYOUT: TrayLayout = { order: ["teams", "dropbox", "onedrive"], hidden: ["onedrive"] };

const TEAMS_SLOT = slot(0, 2, 16, 22);
const DROPBOX_SLOT = slot(18, 2, 34, 22);
const CARET_SLOT = slot(36, 2, 52, 22);
const HIDDEN_PANEL = slot(0, 24, 224, 64);
const MENU_BODY = slot(0, 0, 224, 40);

let setLayout: ReturnType<typeof vi.fn>;
let setActiveRegion: ReturnType<typeof vi.fn>;
let placedRects: Map<Element, DOMRect>;

function trayIcon(id: string, tooltip: string): TrayIcon {
    return { id, hWnd: 1, uID: 1, guid: null, tooltip, icon: `data:image/png;base64,${id}`, version: 4 };
}

function slot(left: number, top: number, right: number, bottom: number) {
    return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} } as DOMRect;
}

function stubBridges() {
    setLayout = vi.fn((layout: TrayLayout) => Promise.resolve(layout));
    setActiveRegion = vi.fn();
    (window as unknown as { shell: unknown }).shell = {
        tray: {
            icons: () => Promise.resolve([TEAMS, DROPBOX, ONEDRIVE]),
            onIconsChanged: () => () => {},
            layout: () => Promise.resolve(STORED_LAYOUT),
            onLayoutChanged: () => () => {},
            setLayout,
            display: () => Promise.resolve({ showOnAllMonitors: true, primaryDisplayId: 0 }),
            onDisplayChanged: () => () => {},
            settings: () => Promise.resolve({ enabled: true, showOverflow: true }),
            onSettingsChanged: () => () => {},
            click: vi.fn(),
        },
    };
    (window as unknown as { topbar: unknown }).topbar = {
        setActiveRegion,
        onCloseMenus: () => () => {},
    };
}

async function renderTray() {
    const { container } = render(<SystemTray />);
    await act(async () => {});
    const cluster = container.firstElementChild as HTMLElement;
    const caretTrigger = cluster.lastElementChild as HTMLElement;
    placedRects.set(screen.getByTitle("Teams"), TEAMS_SLOT);
    placedRects.set(screen.getByTitle("Dropbox"), DROPBOX_SLOT);
    placedRects.set(caretTrigger.querySelector("svg")!.parentElement!, CARET_SLOT);
    return caretTrigger;
}

function openHiddenIcons(caretTrigger: HTMLElement) {
    fireEvent.mouseEnter(caretTrigger);
    placedRects.set(screen.getByTitle("OneDrive").parentElement!, HIDDEN_PANEL);
}

function dragIcon(tooltip: string, to: { x: number; y: number }) {
    const icon = screen.getByTitle(tooltip);
    const from = placedRects.get(icon)!;
    fireEvent.pointerDown(icon, { button: 0, pointerId: 1, clientX: from.left + 8, clientY: from.top + 10 });
    fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y });
    fireEvent.pointerUp(window, { clientX: to.x, clientY: to.y });
}

const lastRegion = () => setActiveRegion.mock.calls.at(-1)?.[0];

beforeEach(() => {
    setChromeSurface(null);
    placedRects = new Map();
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        return placedRects.get(this) ?? MENU_BODY;
    });
    stubBridges();
});

afterEach(() => {
    setChromeSurface(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("SystemTray dragging", () => {
    it("hides an icon dropped on the open hidden-icons panel", async () => {
        const caretTrigger = await renderTray();
        openHiddenIcons(caretTrigger);

        dragIcon("Teams", { x: 120, y: 44 });

        expect(setLayout).toHaveBeenLastCalledWith({ order: ["teams", "dropbox", "onedrive"], hidden: ["onedrive", "teams"] });
    });

    it("keeps the open hidden-icons panel reachable after an icon is dropped on it", async () => {
        const caretTrigger = await renderTray();
        openHiddenIcons(caretTrigger);
        const panelRegion = lastRegion();

        dragIcon("Teams", { x: 120, y: 44 });

        expect(panelRegion).toEqual(expect.objectContaining({ contentBounds: expect.anything() }));
        expect(lastRegion()).toEqual(panelRegion);
    });

    it("keeps the open hidden-icons panel reachable after an icon is reordered on the bar", async () => {
        const caretTrigger = await renderTray();
        openHiddenIcons(caretTrigger);
        const panelRegion = lastRegion();

        dragIcon("Teams", { x: 30, y: 12 });

        expect(setLayout).toHaveBeenLastCalledWith({ order: ["dropbox", "teams", "onedrive"], hidden: ["onedrive"] });
        expect(lastRegion()).toEqual(panelRegion);
    });

    it("hides an icon dropped on the caret while the panel is closed", async () => {
        await renderTray();

        dragIcon("Teams", { x: 44, y: 12 });

        expect(setLayout).toHaveBeenLastCalledWith({ order: ["teams", "dropbox", "onedrive"], hidden: ["onedrive", "teams"] });
        expect(lastRegion()).toBeNull();
    });

    it("leaves a hidden icon hidden when it is dragged around its own panel", async () => {
        const caretTrigger = await renderTray();
        openHiddenIcons(caretTrigger);
        placedRects.set(screen.getByTitle("OneDrive"), slot(8, 32, 40, 64));

        dragIcon("OneDrive", { x: 120, y: 50 });

        expect(setLayout).not.toHaveBeenCalled();
    });
});
