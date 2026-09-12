import { useEffect, useState } from "react";
import { useBattery } from "../../../hooks/useBattery";
import { useBluetooth } from "../../../hooks/useBluetooth";
import { useMonitors } from "../../../hooks/useMonitors";
import { useVolume } from "../../../hooks/useVolume";
import { useNetworkStatus } from "../../../hooks/useNetwork";
import ControlCenter from "./controlCenter";
import PopupMenu from "../shared/popupMenu";
import StatusFace from "../faces/statusFace";
import { useDarkText } from "../../themeContext";

export default function StatusIndicator() {
    const darkText = useDarkText();
    const battery = useBattery();
    const network = useNetworkStatus();
    const bluetooth = useBluetooth();
    const { volume, setVolume, muted, toggleMute } = useVolume();
    const { monitors, setBrightness: setMonitorBrightness } = useMonitors();

    const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
    const [wifiScanning, setWifiScanning] = useState(false);
    const [wifiRadio, setWifiRadio] = useState(true);
    const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
    const [btScanning, setBtScanning] = useState(false);
    const [btEnabledOverride, setBtEnabledOverride] = useState<boolean | null>(null);

    const btResolved = btEnabledOverride !== null
        ? { ...bluetooth, enabled: btEnabledOverride, connected: btEnabledOverride && bluetooth.connected, devices: btEnabledOverride ? bluetooth.devices : [] }
        : bluetooth;

    useEffect(() => {
        if (btEnabledOverride !== null && bluetooth.enabled === btEnabledOverride) {
            setBtEnabledOverride(null);
        }
    }, [bluetooth.enabled, btEnabledOverride]);

    function refreshWifiRadio() {
        window.shell.network.wifiRadioGet().then((r) => {
            if (r.success) setWifiRadio(r.state === 'on');
        });
    }

    function toggleWifiRadio(enabled: boolean) {
        setWifiRadio(enabled);
        window.shell.network.wifiRadioSet(enabled).then((r) => {
            if (r.success) setWifiRadio(r.state === 'on');
            else refreshWifiRadio();
        });
    }

    function toggleBluetoothRadio(enabled: boolean) {
        setBtEnabledOverride(enabled);
        if (!enabled) {
            setBtDevices([]);
            setBtScanning(false);
        } else {
            setBtDevices([]);
            setBtScanning(true);
        }
        window.shell.system.bluetoothSetRadio(enabled)
            .then(() => {
                if (enabled) {
                    let attempts = 0;
                    const trySCan = () => {
                        attempts++;
                        window.shell.system.bluetoothScan().then((result) => {
                            if (result.length > 0 || attempts >= 4) {
                                setBtDevices(result);
                                setBtScanning(false);
                            } else {
                                setTimeout(trySCan, 1500);
                            }
                        });
                    };
                    setTimeout(trySCan, 1500);
                }
            })
            .catch(() => {
                setBtEnabledOverride(null);
                setBtScanning(false);
            });
    }

    function scanWifi() {
        setWifiScanning(true);
        window.shell.network.wifiScan().then((result) => {
            if (result) setWifiNetworks(result);
            setWifiScanning(false);
        });
    }

    function scanBluetooth() {
        setBtScanning(true);
        window.shell.system.bluetoothScan().then((result) => {
            setBtDevices(result);
            setBtScanning(false);
        });
    }

    function scanAll() {
        scanWifi();
        scanBluetooth();
        refreshWifiRadio();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        scanAll();
        window.shell.network.onWifiScanUpdated((data) => {
            setWifiNetworks(data);
            setWifiScanning(false);
        });
        window.shell.system.onBluetoothDevicesChanged((data) => {
            setBtDevices(data);
        });
    }, []);

    return (
        <PopupMenu
            onOpen={scanAll}
            trigger={<StatusFace bluetooth={btResolved} network={network} radioOn={wifiRadio} battery={battery} darkText={darkText} />}
        >
            <ControlCenter
                battery={battery} network={network} bluetooth={btResolved}
                volume={volume} setVolume={setVolume} muted={muted} toggleMute={toggleMute}
                monitors={monitors} setMonitorBrightness={setMonitorBrightness}
                wifiNetworks={wifiNetworks} wifiScanning={wifiScanning} scanWifi={scanWifi}
                wifiRadio={wifiRadio} onToggleWifiRadio={toggleWifiRadio}
                btDevices={btDevices} btScanning={btScanning} scanBluetooth={scanBluetooth}
                onToggleBluetoothRadio={toggleBluetoothRadio}
            />
        </PopupMenu>
    );
}
