import { useMicrophone } from "../../../hooks/useMicrophone";
import { useDarkText } from "../../themeContext";
import MicrophoneFace from "../faces/microphoneFace";

export default function MicrophoneStatus() {
    const darkText = useDarkText();
    const mic = useMicrophone();

    if (!mic.active) return null;

    return <MicrophoneFace apps={mic.apps} darkText={darkText} />;
}
