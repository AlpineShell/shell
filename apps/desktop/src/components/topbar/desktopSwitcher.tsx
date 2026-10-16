import { useDarkText } from "../themeContext";
import { useVirtualDesktops } from "../../hooks/useVirtualDesktops";
import { useDesktopsOnlyWithSeveral } from "../../hooks/useDesktopsOnlyWithSeveral";
import DesktopsFace from "./faces/desktopsFace";
import DesktopLinesFace from "./faces/desktopLinesFace";

const DESKTOP_FACES = { numbers: DesktopsFace, lines: DesktopLinesFace };

export default function DesktopSwitcher({ look }: { look: keyof typeof DESKTOP_FACES }) {
    const darkText = useDarkText();
    const desktops = useVirtualDesktops();
    const onlyWithSeveral = useDesktopsOnlyWithSeveral();

    if (onlyWithSeveral && desktops.count < 2) return null;

    const Face = DESKTOP_FACES[look];
    return (
        <Face
            desktops={desktops}
            darkText={darkText}
            onSelect={(index) => window.shell.desktops.switchTo(index)}
            onClose={(index) => window.shell.desktops.close(index)}
            onAdd={() => window.shell.desktops.add()}
        />
    );
}
