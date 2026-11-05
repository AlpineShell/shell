import { useBattery } from "../../../hooks/useBattery";
import { useBluetooth } from "../../../hooks/useBluetooth";
import { useMonitors } from "../../../hooks/useMonitors";
import { useVolume } from "../../../hooks/useVolume";
import { useNetworkStatus } from "../../../hooks/useNetwork";
import { useWifi } from "../../../hooks/useWifi";
import ControlCenter from "./controlCenter";
import PopupMenu from "../shared/popupMenu";
import StatusFace from "../faces/statusFace";
import { useDarkText } from "../../themeContext";

export default function StatusIndicator() {
    const darkText = useDarkText();
    const battery = useBattery();
    const network = useNetworkStatus();
    const wifi = useWifi();
    const { state: bluetooth } = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();

    function toggleWifiRadio(enabled: boolean) {
        void window.shell.network.wifiRadioSet(enabled).catch(() => {});
    }

    return (
        <PopupMenu
            trigger={<StatusFace bluetooth={bluetooth} network={network} wifiRadio={wifi.radio} battery={battery} darkText={darkText} />}
        >
            <ControlCenter
                battery={battery} network={network} bluetooth={bluetooth}
                volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute}
                monitors={monitors} setMonitorBrightness={setMonitorBrightness}
                wifiState={wifi} onToggleWifiRadio={toggleWifiRadio}
            />
        </PopupMenu>
    );
}
