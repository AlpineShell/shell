import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useBattery } from "../../../hooks/useBattery";
import { useBluetooth } from "../../../hooks/useBluetooth";
import { useMonitors } from "../../../hooks/useMonitors";
import { useVolume } from "../../../hooks/useVolume";
import { useNetworkStatus } from "../../../hooks/useNetwork";
import ControlCenter from "./controlCenter";
import PopupMenu from "../shared/popupMenu";
import StatusFace from "../faces/statusFace";
import { useDarkText } from "../../themeContext";

function requestWifiScan(setNetworks: Dispatch<SetStateAction<WifiNetwork[]>>, setScanning: Dispatch<SetStateAction<boolean>>) {
    window.shell.network.wifiScan().then((result) => {
        if (result) setNetworks(result);
        setScanning(false);
    });
}

function requestWifiRadio(setRadio: Dispatch<SetStateAction<boolean>>) {
    window.shell.network.wifiRadioGet().then((r) => {
        if (r.success) setRadio(r.state === 'on');
    });
}

export default function StatusIndicator() {
    const darkText = useDarkText();
    const battery = useBattery();
    const network = useNetworkStatus();
    const { state: bluetooth } = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();

    const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
    const [wifiScanning, setWifiScanning] = useState(true);
    const [wifiRadio, setWifiRadio] = useState(true);

    function toggleWifiRadio(enabled: boolean) {
        setWifiRadio(enabled);
        window.shell.network.wifiRadioSet(enabled).then((r) => {
            if (r.success) setWifiRadio(r.state === 'on');
            else requestWifiRadio(setWifiRadio);
        });
    }

    function scanWifi() {
        setWifiScanning(true);
        requestWifiScan(setWifiNetworks, setWifiScanning);
    }

    function refreshWifi() {
        scanWifi();
        requestWifiRadio(setWifiRadio);
    }

    useEffect(() => {
        requestWifiScan(setWifiNetworks, setWifiScanning);
        requestWifiRadio(setWifiRadio);
        return window.shell.network.onWifiScanUpdated((data) => {
            setWifiNetworks(data);
            setWifiScanning(false);
        });
    }, []);

    return (
        <PopupMenu
            onOpen={refreshWifi}
            trigger={<StatusFace bluetooth={bluetooth} network={network} radioOn={wifiRadio} battery={battery} darkText={darkText} />}
        >
            <ControlCenter
                battery={battery} network={network} bluetooth={bluetooth}
                volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute}
                monitors={monitors} setMonitorBrightness={setMonitorBrightness}
                wifiNetworks={wifiNetworks} wifiScanning={wifiScanning} scanWifi={scanWifi}
                wifiRadio={wifiRadio} onToggleWifiRadio={toggleWifiRadio}
            />
        </PopupMenu>
    );
}
