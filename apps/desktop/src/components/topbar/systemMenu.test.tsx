import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import SystemMenu, { SystemMenuActions } from "./systemMenu";
import { setChromeSurface } from "./chrome/chromeStore";

const ENTRIES = [
    ["logout", "Log Out", "Confirm log out?"],
    ["restart", "Restart", "Confirm restart?"],
    ["shutdown", "Shut Down", "Confirm shut down?"],
] as const;

let powerAction: ReturnType<typeof vi.fn>;
let closeMenus: (() => void) | null = null;
let powerConfirmChanged: ((value: boolean) => void) | null = null;

const neverSettles = () => new Promise<boolean>(() => {});
const button = (name: string) => screen.getByRole("button", { name });
const questionShown = (name: string) => screen.queryByRole("button", { name }) !== null;

function stubBridges(storedChoice: Promise<boolean>) {
    powerAction = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { shell: unknown }).shell = {
        system: {
            powerAction,
            powerConfirm: () => storedChoice,
            showHibernate: () => Promise.resolve(false),
            onShowHibernateChanged: () => () => {},
            onPowerConfirmChanged: (callback: (value: boolean) => void) => {
                powerConfirmChanged = callback;
                return () => {
                    powerConfirmChanged = null;
                };
            },
        },
    };
    (window as unknown as { topbar: unknown }).topbar = {
        setActiveRegion: vi.fn(),
        onCloseMenus: (callback: () => void) => {
            closeMenus = callback;
            return () => {
                closeMenus = null;
            };
        },
    };
}

async function renderBarMenu(storedChoice: Promise<boolean>) {
    stubBridges(storedChoice);
    const { container } = render(<SystemMenu />);
    await act(async () => {});
    return container.firstElementChild as HTMLElement;
}

function reservedLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll("span[aria-hidden='true']"), (span) => span.textContent);
}

beforeEach(() => {
    setChromeSurface(null);
    stubBridges(neverSettles());
});

afterEach(() => {
    setChromeSurface(null);
});

describe("SystemMenuActions with confirmation on", () => {
    it.each(ENTRIES)("needs a second click to %s", (action, label, question) => {
        render(<SystemMenuActions darkText={false} confirmRequired showHibernate={false} />);

        fireEvent.click(button(label));
        expect(powerAction).not.toHaveBeenCalled();

        fireEvent.click(button(question));
        expect(powerAction.mock.calls).toEqual([[action]]);
    });

    it("moves the question to whichever action was pressed last", () => {
        render(<SystemMenuActions darkText={false} confirmRequired showHibernate={false} />);

        fireEvent.click(button("Shut Down"));
        fireEvent.click(button("Restart"));

        expect(powerAction).not.toHaveBeenCalled();
        expect(questionShown("Confirm shut down?")).toBe(false);
        expect(button("Shut Down")).toBeTruthy();

        fireEvent.click(button("Confirm restart?"));
        expect(powerAction.mock.calls).toEqual([["restart"]]);
    });

    it("keeps room for every question so arming one never reflows the menu", () => {
        const { container } = render(<SystemMenuActions darkText={false} confirmRequired showHibernate={false} />);
        expect(reservedLabels(container)).toEqual(ENTRIES.map(([, , question]) => question));
    });
});

describe("SystemMenuActions with confirmation off", () => {
    it.each(ENTRIES)("acts on the first click to %s", (action, label, question) => {
        render(<SystemMenuActions darkText={false} confirmRequired={false} showHibernate={false} />);

        fireEvent.click(button(label));

        expect(powerAction.mock.calls).toEqual([[action]]);
        expect(questionShown(question)).toBe(false);
    });

    it("reserves no more room than the labels themselves need", () => {
        const { container } = render(<SystemMenuActions darkText={false} confirmRequired={false} showHibernate={false} />);
        expect(reservedLabels(container)).toEqual(ENTRIES.map(([, label]) => label));
    });
});

describe("SystemMenuActions with Hibernate shown", () => {
    it("hibernates on the first click even while the other actions ask twice", () => {
        render(<SystemMenuActions darkText={false} confirmRequired showHibernate />);

        fireEvent.click(button("Hibernate"));

        expect(powerAction.mock.calls).toEqual([["hibernate"]]);
    });

    it("leaves Hibernate out when the setting is off", () => {
        render(<SystemMenuActions darkText={false} confirmRequired showHibernate={false} />);
        expect(questionShown("Hibernate")).toBe(false);
    });
});

describe("SystemMenu on the bar", () => {
    it("draws the system menu face as its trigger", async () => {
        const trigger = await renderBarMenu(neverSettles());
        expect(trigger.querySelector("svg.lucide-circle-dashed")).not.toBeNull();
    });

    it("asks for a second click before the stored choice has arrived", async () => {
        const trigger = await renderBarMenu(neverSettles());
        fireEvent.mouseEnter(trigger);

        fireEvent.click(button("Shut Down"));

        expect(powerAction).not.toHaveBeenCalled();
        expect(questionShown("Confirm shut down?")).toBe(true);
    });

    it("acts on one click once the user has turned confirmation off", async () => {
        const trigger = await renderBarMenu(Promise.resolve(false));
        fireEvent.mouseEnter(trigger);

        fireEvent.click(button("Shut Down"));

        expect(powerAction.mock.calls).toEqual([["shutdown"]]);
    });

    it("follows a choice changed in Settings while the bar is running", async () => {
        const trigger = await renderBarMenu(Promise.resolve(true));
        act(() => powerConfirmChanged?.(false));
        fireEvent.mouseEnter(trigger);

        fireEvent.click(button("Restart"));

        expect(powerAction.mock.calls).toEqual([["restart"]]);
    });

    it("forgets an armed action once the menu has closed", async () => {
        const trigger = await renderBarMenu(Promise.resolve(true));
        fireEvent.mouseEnter(trigger);
        fireEvent.click(button("Shut Down"));
        expect(questionShown("Confirm shut down?")).toBe(true);

        act(() => closeMenus?.());
        await waitFor(() => expect(questionShown("Confirm shut down?")).toBe(false));

        fireEvent.mouseEnter(trigger);
        fireEvent.click(button("Shut Down"));

        expect(powerAction).not.toHaveBeenCalled();
        expect(questionShown("Confirm shut down?")).toBe(true);
    });
});
