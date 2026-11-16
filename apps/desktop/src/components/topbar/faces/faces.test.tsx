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
import VolumeFace from "./volumeFace";

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

const bluetoothState = (radio: BluetoothRadioState, connected: boolean, devicesAvailable = true): BluetoothState => ({
    radio: { state: radio, pending: null, error: null },
    devices: [
        {
            id: "headphones",
            name: "Headphones",
            kind: "headphones",
            connected,
            canConnect: !connected,
            canDisconnect: connected,
            audioDisabled: false,
            pending: null,
            error: null,
        },
    ],
    devicesAvailable,
});

const status = (over: Partial<Omit<StatusFaceProps, "darkText">> = {}): Omit<StatusFaceProps, "darkText"> => ({
    bluetooth: bluetoothState("on", false),
    network: { signal: 80, connected: true, type: "wifi", ssid: "Home", wifi: { connected: true, ssid: "Home", signal: 80 } },
    wifiRadio: 'on',
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
    ["MicrophoneFace", (darkText) => <MicrophoneFace apps={["Zoom", "Teams"]} darkText={darkText} />],
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

    const volumeFill = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-volume-fill]");

    it("draws no volume fill when it is not given the volume", () => {
        const { container } = render(<MediaFace title="Blue in Green" appIcon={null} peak={1} darkText={false} />);
        expect(volumeFill(container)).toBeNull();
    });

    it("fills up to the volume and shows the fill only while the volume is changing", () => {
        const shown = render(<MediaFace title="Blue in Green" appIcon={null} peak={1} darkText={false} volume={{ level: 0.64, showing: true }} />).container;
        const hidden = render(<MediaFace title="Blue in Green" appIcon={null} peak={1} darkText={false} volume={{ level: 0.64, showing: false }} />).container;
        expect(volumeFill(shown)?.style.width).toBe("64%");
        expect(volumeFill(shown)?.style.opacity).toBe("1");
        expect(volumeFill(hidden)?.style.width).toBe("64%");
        expect(volumeFill(hidden)?.style.opacity).toBe("0");
    });

    it("fills behind the app icon too", () => {
        const { container } = render(<MediaFace title="Blue in Green" appIcon={PNG_BASE64} peak={0} darkText={false} volume={{ level: 0.3, showing: true }} />);
        expect(volumeFill(container)?.style.width).toBe("30%");
    });

    it("keeps the music bars as they are at full volume", () => {
        const plain = render(<MediaFace title="Blue in Green" appIcon={null} peak={0.6} darkText={false} />).container;
        const atFullVolume = render(<MediaFace title="Blue in Green" appIcon={null} peak={0.6} darkText={false} volume={{ level: 1, showing: false }} />).container;
        expect(barHeights(atFullVolume)).toEqual(barHeights(plain));
    });

    it("lowers the music bars with the volume and rests them while muted", () => {
        const loud = barHeights(render(<MediaFace title="Blue in Green" appIcon={null} peak={0.8} darkText={false} volume={{ level: 0.9, showing: false }} />).container);
        const quiet = barHeights(render(<MediaFace title="Blue in Green" appIcon={null} peak={0.8} darkText={false} volume={{ level: 0.2, showing: false }} />).container);
        const muted = barHeights(render(<MediaFace title="Blue in Green" appIcon={null} peak={0.8} darkText={false} volume={{ level: 0, showing: true }} />).container);
        quiet.forEach((height, i) => expect(height).toBeLessThan(loud[i]));
        expect(muted).toEqual([2, 2, 2, 2, 2]);
    });
});

describe("VolumeFace", () => {
    it.each([
        [0, "lucide-volume-x"],
        [0.2, "lucide-volume1"],
        [0.8, "lucide-volume2"],
    ])("shows the speaker for a level of %s", (level, icon) => {
        const { container } = render(<VolumeFace level={level} darkText={false} />);
        expect(iconNames(container)).toEqual([icon]);
    });

    it("fills up to the level, always shown", () => {
        const { container } = render(<VolumeFace level={0.46} darkText={true} />);
        const fill = container.querySelector<HTMLElement>("[data-volume-fill]");
        expect(fill?.style.width).toBe("46%");
        expect(fill?.style.opacity).toBe("1");
    });
});

describe("StatusFace", () => {
    const icons = (over: Partial<Omit<StatusFaceProps, "darkText">>) =>
        iconNames(render(<StatusFace {...status(over)} darkText={false} />).container);

    it.each([
        ["ethernet, even with the radio off", { network: { signal: null, connected: true, type: "ethernet", ssid: null, wifi: { connected: false, ssid: null, signal: null } }, wifiRadio: 'off' }, "lucide-ethernet-port"],
        ["the radio off", { wifiRadio: 'off' }, "lucide-wifi-off"],
        ["no connection", { network: { signal: 80, connected: false, type: "wifi", ssid: null, wifi: { connected: false, ssid: null, signal: null } } }, "lucide-wifi-off"],
        ["an unknown signal", { network: { signal: null, connected: true, type: "wifi", ssid: "Home", wifi: { connected: true, ssid: "Home", signal: null } } }, "lucide-wifi"],
        ["a signal of 70", { network: { signal: 70, connected: true, type: "wifi", ssid: "Home", wifi: { connected: true, ssid: "Home", signal: 70 } } }, "lucide-wifi"],
        ["a signal of 40", { network: { signal: 40, connected: true, type: "wifi", ssid: "Home", wifi: { connected: true, ssid: "Home", signal: 40 } } }, "lucide-wifi-high"],
        ["a signal of 10", { network: { signal: 10, connected: true, type: "wifi", ssid: "Home", wifi: { connected: true, ssid: "Home", signal: 10 } } }, "lucide-wifi-low"],
        ["a signal of 9", { network: { signal: 9, connected: true, type: "wifi", ssid: "Home", wifi: { connected: true, ssid: "Home", signal: 9 } } }, "lucide-wifi-zero"],
    ] as const)("draws the network for %s", (_, over, expected) => {
        expect(icons(over)[1]).toBe(expected);
    });

    it.each<[string, BluetoothState, string]>([
        ["off", bluetoothState("off", false), "lucide-bluetooth-off"],
        ["without an adapter", bluetoothState("unavailable", false), "lucide-bluetooth-off"],
        ["connected", bluetoothState("on", true), "lucide-bluetooth-connected"],
        ["on and idle", bluetoothState("on", false), "lucide-bluetooth"],
        ["while its devices are still unknown", bluetoothState("on", false, false), "lucide-bluetooth"],
    ])("draws Bluetooth %s", (_, bluetooth, expected) => {
        expect(icons({ bluetooth })[0]).toBe(expected);
    });

    it.each<[string, BluetoothState, string]>([
        ["dims the Bluetooth glyph while Bluetooth is still being checked", bluetoothState("unknown", false, false), "0.5"],
        ["keeps the Bluetooth glyph at full strength while Bluetooth is on", bluetoothState("on", false), "1"],
    ])("%s", (_, bluetooth, opacity) => {
        const glyph = render(<StatusFace {...status({ bluetooth })} darkText={false} />).container.querySelector("svg");
        expect(glyph?.getAttribute("opacity")).toBe(opacity);
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

describe("MicrophoneFace", () => {
    it.each<[string[], string]>([
        [["Zoom", "Teams"], "Zoom, Teams"],
        [[], "In use"],
    ])("reads %j as %s", (apps, label) => {
        const { container } = render(<MicrophoneFace apps={apps} darkText={false} />);
        expect(container.textContent).toBe(label);
    });
});
