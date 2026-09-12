import { useMicrophone } from "../../../hooks/useMicrophone";
import { useDarkText } from "../../themeContext";
import MicrophoneFace from "../faces/microphoneFace";

function microphoneLabel(apps: string[]) {
    return apps.length > 0 ? apps.join(", ") : "In use";
}

export default function MicrophoneStatus() {
    const darkText = useDarkText();
    const mic = useMicrophone();

    if (!mic.active) return null;

    return <MicrophoneFace label={microphoneLabel(mic.apps)} darkText={darkText} />;
}
