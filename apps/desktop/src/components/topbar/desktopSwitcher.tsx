import { useDarkText } from "../themeContext";
import { useVirtualDesktops } from "../../hooks/useVirtualDesktops";
import DesktopsFace from "./faces/desktopsFace";

export default function DesktopSwitcher() {
    const darkText = useDarkText();
    const desktops = useVirtualDesktops();

    return (
        <DesktopsFace
            desktops={desktops}
            darkText={darkText}
            onSelect={(index) => window.shell.desktops.switchTo(index)}
            onAdd={() => window.shell.desktops.add()}
        />
    );
}
