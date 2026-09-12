import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import SystemMenuFace from "./systemMenuFace";
import NoticeFace from "./noticeFace";
import LauncherFace from "./launcherFace";
import TrayFace from "./trayFace";
import MediaFace, { MusicBarsGlyph } from "./mediaFace";
import MicrophoneFace from "./microphoneFace";
import StatusFace from "./statusFace";
import ClockFace from "./clockFace";

const PNG_BASE64 = "iVBORw0KGgo=";
const TRAY_ICON_URL = `data:image/png;base64,${PNG_BASE64}`;
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [tabindex], [role='button'], [contenteditable]";

const notice = (over: Partial<NoticeFaceProps["notice"]> = {}): NoticeFaceProps["notice"] => ({
    title: "Android",
    message: "Reading IG.apk",
    tone: "info",
    busy: false,
    ...over,
});

const status = (over: Partial<Omit<StatusFaceProps, "darkText">> = {}): Omit<StatusFaceProps, "darkText"> => ({
    bluetooth: { enabled: true, connected: false },
    network: { signal: 80, connected: true, type: "wifi" },
    radioOn: true,
    battery: { percent: 64, charging: false, hasBattery: true },
    ...over,
});

const FACES: [string, (darkText: boolean) => ReactElement][] = [
    ["SystemMenuFace", (darkText) => <SystemMenuFace darkText={darkText} />],
    ["NoticeFace", (darkText) => <NoticeFace notice={notice()} darkText={darkText} />],
    ["NoticeFace while busy", (darkText) => <NoticeFace notice={notice({ busy: true })} darkText={darkText} />],
    ["LauncherFace", (darkText) => <LauncherFace darkText={darkText} />],
    [
        "TrayFace",
        (darkText) => (
            <TrayFace
                icons={[
                    { id: "dropbox", tooltip: "Dropbox", icon: TRAY_ICON_URL },
                    { id: "blank", tooltip: "No icon", icon: "" },
                ]}
                showCaret
                darkText={darkText}
            />
        ),
    ],
    ["MediaFace with bars", (darkText) => <MediaFace title="Blue in Green" appIcon={null} peak={0.6} darkText={darkText} />],
    ["MediaFace with the app icon", (darkText) => <MediaFace title="Blue in Green" appIcon={PNG_BASE64} peak={0} darkText={darkText} />],
    ["MicrophoneFace", (darkText) => <MicrophoneFace label="Zoom, Teams" darkText={darkText} />],
    ["StatusFace", (darkText) => <StatusFace {...status()} darkText={darkText} />],
    ["ClockFace", (darkText) => <ClockFace time="09:41" date="Sep 12" darkText={darkText} />],
];

function reactPropsOf(element: Element): Record<string, unknown> | undefined {
    const key = Object.keys(element).find((name) => name.startsWith("__reactProps$"));
    return key ? (element as unknown as Record<string, Record<string, unknown>>)[key] : undefined;
}

function elementsWithReactProps(container: HTMLElement) {
    return Array.from(container.querySelectorAll("*")).filter((element) => reactPropsOf(element) !== undefined);
}

function handlerNames(container: HTMLElement) {
    return elementsWithReactProps(container).flatMap((element) =>
        Object.entries(reactPropsOf(element) ?? {})
            .filter(([name, value]) => /^on[A-Z]/.test(name) && typeof value === "function")
            .map(([name]) => `${element.tagName.toLowerCase()}.${name}`)
    );
}

function iconNames(container: HTMLElement) {
    return Array.from(container.querySelectorAll("svg")).map((svg) => Array.from(svg.classList).find((name) => name.startsWith("lucide-")));
}

function barHeights(container: HTMLElement) {
    return Array.from(container.querySelectorAll("rect")).map((rect) => Number(rect.getAttribute("height")));
}

describe.each(FACES)("%s", (_, renderFace) => {
    it.each([true, false])("renders nothing a pointer or key can act on when darkText is %s", (darkText) => {
        const { container } = render(renderFace(darkText));
        expect(elementsWithReactProps(container)).not.toHaveLength(0);
        expect(container.querySelectorAll(INTERACTIVE_SELECTOR)).toHaveLength(0);
        expect(handlerNames(container)).toEqual([]);
    });

    it("draws dark text differently from light text", () => {
        const onLightBar = render(renderFace(true)).container.innerHTML;
        const onDarkBar = render(renderFace(false)).container.innerHTML;
        expect(onLightBar).not.toBe(onDarkBar);
    });
});

describe("NoticeFace", () => {
    const mark = (over: Partial<NoticeFaceProps["notice"]>, darkText: boolean) =>
        render(<NoticeFace notice={notice(over)} darkText={darkText} />).container.querySelector("div > span");

    it.each([
        ["error", true, "bg-rose-500"],
        ["success", false, "bg-emerald-500"],
        ["info", true, "bg-black/30"],
        ["info", false, "bg-white/45"],
    ] as const)("marks a %s notice with %s dark text using %s", (tone, darkText, dotClass) => {
        expect(mark({ tone }, darkText)?.classList).toContain(dotClass);
    });

    it("swaps the dot for a spinner while busy", () => {
        expect(mark({ busy: true, tone: "error" }, false)?.classList).toContain("animate-spin");
        expect(mark({ busy: true, tone: "error" }, false)?.classList).not.toContain("bg-rose-500");
    });

    it("titles the notice with its heading when it has one", () => {
        const titled = render(<NoticeFace notice={notice()} darkText={false} />).container.firstElementChild;
        const untitled = render(<NoticeFace notice={notice({ title: null })} darkText={false} />).container.firstElementChild;
        expect(titled?.getAttribute("title")).toBe("Android — Reading IG.apk");
        expect(untitled?.getAttribute("title")).toBe("Reading IG.apk");
    });
});

describe("LauncherFace", () => {
    it("is phrasing content, so the live trigger can wrap it in its button", () => {
        const { container } = render(<LauncherFace darkText={false} />);
        expect(container.firstElementChild?.tagName).toBe("SPAN");
        expect(container.textContent).toBe("Search");
    });
});

describe("TrayFace", () => {
    const icons: TrayFaceIcon[] = [
        { id: "dropbox", tooltip: "Dropbox", icon: TRAY_ICON_URL },
        { id: "blank", tooltip: "No icon", icon: "" },
    ];

    it("draws one slot per icon, with a placeholder square for an icon without an image", () => {
        const { container } = render(<TrayFace icons={icons} showCaret={false} darkText={false} />);
        const slots = Array.from(container.firstElementChild?.children ?? []);
        expect(slots.map((slot) => slot.getAttribute("title"))).toEqual(["Dropbox", "No icon"]);
        expect(slots[0].querySelector("img")?.getAttribute("src")).toBe(TRAY_ICON_URL);
        expect(slots[1].querySelector("img")).toBeNull();
        expect(slots[1].firstElementChild?.classList).toContain("bg-white/20");
    });

    it("shows the overflow caret only when asked to", () => {
        const withCaret = render(<TrayFace icons={icons} showCaret darkText={false} />).container;
        const withoutCaret = render(<TrayFace icons={icons} showCaret={false} darkText={false} />).container;
        expect(iconNames(withCaret)).toEqual(["lucide-chevron-down"]);
        expect(iconNames(withoutCaret)).toEqual([]);
    });
});

describe("MusicBarsGlyph", () => {
    it.each([0, 0.04])("rests every bar at its minimum height for a peak of %s", (peak) => {
        const { container } = render(<MusicBarsGlyph peak={peak} color="white" />);
        expect(barHeights(container)).toEqual([2, 2, 2, 2, 2]);
    });

    it("raises every bar to its own ceiling at full peak, centred in the glyph", () => {
        const { container } = render(<MusicBarsGlyph peak={1} color="black" />);
        const heights = barHeights(container);
        [6.4, 10.8, 8.05, 13, 7.5].forEach((expected, i) => expect(heights[i]).toBeCloseTo(expected));
        Array.from(container.querySelectorAll("rect")).forEach((rect, i) => {
            expect(Number(rect.getAttribute("y"))).toBeCloseTo((13 - heights[i]) / 2);
            expect(rect.getAttribute("fill")).toBe("black");
        });
    });
});

describe("MediaFace", () => {
    it("leads with the app icon when given one", () => {
        const { container } = render(<MediaFace title="Blue in Green" appIcon={PNG_BASE64} peak={1} darkText={false} />);
        expect(container.querySelector("img")?.getAttribute("src")).toBe(TRAY_ICON_URL);
        expect(container.querySelector("svg")).toBeNull();
        expect(container.firstElementChild?.classList).toContain("pl-0.5");
        expect(container.textContent).toBe("Blue in Green");
    });

    it("leads with the music bars when there is no app icon", () => {
        const { container } = render(<MediaFace title="Blue in Green" appIcon={null} peak={1} darkText={false} />);
        expect(container.querySelector("img")).toBeNull();
        expect(barHeights(container)).toHaveLength(5);
        expect(container.firstElementChild?.classList).toContain("px-2");
    });
});

describe("StatusFace", () => {
    const icons = (over: Partial<Omit<StatusFaceProps, "darkText">>) =>
        iconNames(render(<StatusFace {...status(over)} darkText={false} />).container);

    it.each([
        ["ethernet, even with the radio off", { network: { signal: null, connected: true, type: "ethernet" }, radioOn: false }, "lucide-ethernet-port"],
        ["the radio off", { radioOn: false }, "lucide-wifi-off"],
        ["no connection", { network: { signal: 80, connected: false, type: "wifi" } }, "lucide-wifi-off"],
        ["an unknown signal", { network: { signal: null, connected: true, type: "wifi" } }, "lucide-wifi"],
        ["a signal of 70", { network: { signal: 70, connected: true, type: "wifi" } }, "lucide-wifi"],
        ["a signal of 40", { network: { signal: 40, connected: true, type: "wifi" } }, "lucide-wifi-high"],
        ["a signal of 10", { network: { signal: 10, connected: true, type: "wifi" } }, "lucide-wifi-low"],
        ["a signal of 9", { network: { signal: 9, connected: true, type: "wifi" } }, "lucide-wifi-zero"],
    ] as const)("draws the network for %s", (_, over, expected) => {
        expect(icons(over)[1]).toBe(expected);
    });

    it.each([
        ["off", { enabled: false, connected: false }, "lucide-bluetooth-off"],
        ["connected", { enabled: true, connected: true }, "lucide-bluetooth-connected"],
        ["on and idle", { enabled: true, connected: false }, "lucide-bluetooth"],
    ] as const)("draws Bluetooth %s", (_, bluetooth, expected) => {
        expect(icons({ bluetooth })[0]).toBe(expected);
    });

    it.each([
        ["charging", { percent: 5, charging: true }, "lucide-battery-charging"],
        ["an unknown charge", { percent: null, charging: false }, "lucide-battery"],
        ["80%", { percent: 80, charging: false }, "lucide-battery-full"],
        ["40%", { percent: 40, charging: false }, "lucide-battery-medium"],
        ["15%", { percent: 15, charging: false }, "lucide-battery-low"],
        ["14%", { percent: 14, charging: false }, "lucide-battery-warning"],
    ] as const)("draws the battery at %s", (_, charge, expected) => {
        expect(icons({ battery: { ...charge, hasBattery: true } })[2]).toBe(expected);
    });

    it("leaves the battery out on a machine without one", () => {
        expect(icons({ battery: { percent: null, charging: false, hasBattery: false } })).toHaveLength(2);
    });
});

describe("ClockFace", () => {
    it("shows the time, then the date", () => {
        const { container } = render(<ClockFace time="9:41 PM" date="Sep 12" darkText={false} />);
        expect(container.textContent).toBe("9:41 PM Sep 12");
    });
});
