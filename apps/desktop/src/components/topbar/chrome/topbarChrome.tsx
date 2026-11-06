import { useSyncExternalStore } from "react";
import ChromeCanvas from "./ChromeCanvas";
import { isBarHovered, subscribeBarHovered } from "./chromeStore";
import { useWindowCoverage } from "../../../hooks/useWindowCoverage";

interface TopbarChromeProps {
    barHeight: number;
    bg: string;
    barBorderColor: string;
}

export default function TopbarChrome({ barHeight, bg, barBorderColor }: TopbarChromeProps) {
    const hovered = useSyncExternalStore(subscribeBarHovered, isBarHovered);
    const windowCoverage = useWindowCoverage();
    return <ChromeCanvas barHeight={barHeight} bg={bg} barBorderColor={barBorderColor} hovered={hovered} windowCoverage={windowCoverage} />;
}
