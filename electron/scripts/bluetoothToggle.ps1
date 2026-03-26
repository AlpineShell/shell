param(
    [string]$InstanceId,
    [string]$Action
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
$null = [Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService, Windows.Devices.Bluetooth.Rfcomm, ContentType=WindowsRuntime]
$null = [Windows.Networking.Sockets.StreamSocket, Windows.Networking.Sockets, ContentType=WindowsRuntime]

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public struct BLUETOOTH_FIND_RADIO_PARAMS { public int dwSize; }

[StructLayout(LayoutKind.Sequential)]
public struct SYSTEMTIME {
    public ushort wYear, wMonth, wDayOfWeek, wDay;
    public ushort wHour, wMinute, wSecond, wMilliseconds;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct BLUETOOTH_DEVICE_INFO {
    public int dwSize;
    public long Address;
    public uint ulClassofDevice;
    [MarshalAs(UnmanagedType.Bool)] public bool fConnected;
    [MarshalAs(UnmanagedType.Bool)] public bool fRemembered;
    [MarshalAs(UnmanagedType.Bool)] public bool fAuthenticated;
    public SYSTEMTIME stLastSeen;
    public SYSTEMTIME stLastUsed;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string szName;
}

[StructLayout(LayoutKind.Sequential)]
public struct BLUETOOTH_DEVICE_SEARCH_PARAMS {
    public int dwSize;
    [MarshalAs(UnmanagedType.Bool)] public bool fReturnAuthenticated;
    [MarshalAs(UnmanagedType.Bool)] public bool fReturnRemembered;
    [MarshalAs(UnmanagedType.Bool)] public bool fReturnUnknown;
    [MarshalAs(UnmanagedType.Bool)] public bool fReturnConnected;
    [MarshalAs(UnmanagedType.Bool)] public bool fIssueInquiry;
    public byte cTimeoutMultiplier;
    public IntPtr hRadio;
}

public static class BtApi {
    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    public static extern IntPtr BluetoothFindFirstRadio(ref BLUETOOTH_FIND_RADIO_PARAMS p, out IntPtr h);
    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BluetoothFindRadioClose(IntPtr h);
    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    public static extern IntPtr BluetoothFindFirstDevice(ref BLUETOOTH_DEVICE_SEARCH_PARAMS p, ref BLUETOOTH_DEVICE_INFO d);
    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BluetoothFindNextDevice(IntPtr h, ref BLUETOOTH_DEVICE_INFO d);
    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BluetoothFindDeviceClose(IntPtr h);
    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    public static extern uint BluetoothSetServiceState(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO d, ref Guid g, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr h);
}
"@ -ErrorAction SilentlyContinue

$typeName = 'System.WindowsRuntimeSystemExtensions'
$asTaskGeneric = ([type]$typeName).GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
$asTaskAction = ([type]$typeName).GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
} | Select-Object -First 1

$targetAddr = 0L
$targetHex = ''
if ($InstanceId -match 'Dev_([0-9a-fA-F]{12})') {
    $targetHex = $Matches[1]
    $targetAddr = [Convert]::ToInt64($targetHex, 16)
}

if ($targetAddr -eq 0) {
    @{ success = $false } | ConvertTo-Json -Compress
    return
}

if ($Action -eq 'connect') {
    $macLong = [Convert]::ToUInt64($targetHex, 16)
    $btDevice = $null
    $connected = $false

    try {
        $asTask = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Bluetooth.BluetoothDevice])
        $task = $asTask.Invoke($null, @([Windows.Devices.Bluetooth.BluetoothDevice]::FromBluetoothAddressAsync($macLong)))
        $null = $task.Wait(10000)
        $btDevice = $task.Result
    } catch {}

    if ($btDevice) {
        try {
            $asTask2 = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceServicesResult])
            $task2 = $asTask2.Invoke($null, @($btDevice.GetRfcommServicesAsync()))
            $null = $task2.Wait(10000)
            $svcResult = $task2.Result

            foreach ($svc in $svcResult.Services) {
                try {
                    $socket = New-Object Windows.Networking.Sockets.StreamSocket
                    $connectTask = $asTaskAction.Invoke($null, @($socket.ConnectAsync($svc.ConnectionHostName, $svc.ConnectionServiceName)))
                    $null = $connectTask.Wait(10000)
                    Start-Sleep -Seconds 2
                    $socket.Dispose()
                    $connected = $true
                    break
                } catch {
                    try { $socket.Dispose() } catch {}
                }
            }
        } catch {}
        $btDevice.Dispose()
    }

    @{ success = $connected } | ConvertTo-Json -Compress
} elseif ($Action -eq 'disconnect') {
    $rp = New-Object BLUETOOTH_FIND_RADIO_PARAMS
    $rp.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($rp)
    $hRadio = [IntPtr]::Zero
    $hFind = [BtApi]::BluetoothFindFirstRadio([ref]$rp, [ref]$hRadio)

    $success = $false

    if ($hFind -ne [IntPtr]::Zero -and $hRadio -ne [IntPtr]::Zero) {
        [BtApi]::BluetoothFindRadioClose($hFind) | Out-Null

        $sp = New-Object BLUETOOTH_DEVICE_SEARCH_PARAMS
        $sp.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($sp)
        $sp.fReturnAuthenticated = $true
        $sp.fReturnRemembered = $true
        $sp.fReturnConnected = $true
        $sp.hRadio = $hRadio

        $di = New-Object BLUETOOTH_DEVICE_INFO
        $di.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($di)

        $hDevFind = [BtApi]::BluetoothFindFirstDevice([ref]$sp, [ref]$di)
        $found = $false
        if ($hDevFind -ne [IntPtr]::Zero) {
            do {
                if ($di.Address -eq $targetAddr) { $found = $true; break }
            } while ([BtApi]::BluetoothFindNextDevice($hDevFind, [ref]$di))
            [BtApi]::BluetoothFindDeviceClose($hDevFind) | Out-Null
        }

        if ($found) {
            $serviceGuids = @(
                [Guid]::new("0000110B-0000-1000-8000-00805F9B34FB"),
                [Guid]::new("0000111E-0000-1000-8000-00805F9B34FB"),
                [Guid]::new("0000110E-0000-1000-8000-00805F9B34FB")
            )
            foreach ($guid in $serviceGuids) {
                $r = [BtApi]::BluetoothSetServiceState($hRadio, [ref]$di, [ref]$guid, 0x02)
                if ($r -eq 0) { $success = $true }
            }
        }

        [BtApi]::CloseHandle($hRadio) | Out-Null
    }

    @{ success = $success } | ConvertTo-Json -Compress
}
