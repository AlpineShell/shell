param(
    [string]$InstanceId,
    [string]$Action
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public struct BLUETOOTH_FIND_RADIO_PARAMS {
    public int dwSize;
}

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
    public static extern IntPtr BluetoothFindFirstRadio(ref BLUETOOTH_FIND_RADIO_PARAMS pbtfrp, out IntPtr phRadio);

    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BluetoothFindRadioClose(IntPtr hFind);

    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    public static extern IntPtr BluetoothFindFirstDevice(ref BLUETOOTH_DEVICE_SEARCH_PARAMS pbtsp, ref BLUETOOTH_DEVICE_INFO pbtdi);

    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BluetoothFindNextDevice(IntPtr hFind, ref BLUETOOTH_DEVICE_INFO pbtdi);

    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool BluetoothFindDeviceClose(IntPtr hFind);

    [DllImport("BluetoothAPIs.dll", SetLastError = true)]
    public static extern uint BluetoothSetServiceState(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO pbtdi, ref Guid pGuidService, uint dwServiceFlags);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr hObject);
}
"@ -ErrorAction Stop

$BLUETOOTH_SERVICE_ENABLE = 0x01
$BLUETOOTH_SERVICE_DISABLE = 0x02

$serviceGuids = @(
    [Guid]::new("0000110B-0000-1000-8000-00805F9B34FB"),
    [Guid]::new("0000111E-0000-1000-8000-00805F9B34FB"),
    [Guid]::new("0000110E-0000-1000-8000-00805F9B34FB")
)

$targetAddr = 0L
if ($InstanceId -match 'Dev_([0-9a-fA-F]{12})') {
    $targetAddr = [Convert]::ToInt64($Matches[1], 16)
}

if ($targetAddr -eq 0) {
    @{ success = $false } | ConvertTo-Json -Compress
    return
}

$radioParams = New-Object BLUETOOTH_FIND_RADIO_PARAMS
$radioParams.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($radioParams)
$hRadio = [IntPtr]::Zero
$hFind = [BtApi]::BluetoothFindFirstRadio([ref]$radioParams, [ref]$hRadio)

if ($hFind -eq [IntPtr]::Zero -or $hRadio -eq [IntPtr]::Zero) {
    @{ success = $false } | ConvertTo-Json -Compress
    return
}

[BtApi]::BluetoothFindRadioClose($hFind) | Out-Null

$searchParams = New-Object BLUETOOTH_DEVICE_SEARCH_PARAMS
$searchParams.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($searchParams)
$searchParams.fReturnAuthenticated = $true
$searchParams.fReturnRemembered = $true
$searchParams.fReturnConnected = $true
$searchParams.fReturnUnknown = $false
$searchParams.fIssueInquiry = $false
$searchParams.cTimeoutMultiplier = 0
$searchParams.hRadio = $hRadio

$deviceInfo = New-Object BLUETOOTH_DEVICE_INFO
$deviceInfo.dwSize = [Runtime.InteropServices.Marshal]::SizeOf($deviceInfo)

$found = $false
$hDevFind = [BtApi]::BluetoothFindFirstDevice([ref]$searchParams, [ref]$deviceInfo)

if ($hDevFind -ne [IntPtr]::Zero) {
    do {
        if ($deviceInfo.Address -eq $targetAddr) {
            $found = $true
            break
        }
    } while ([BtApi]::BluetoothFindNextDevice($hDevFind, [ref]$deviceInfo))
    [BtApi]::BluetoothFindDeviceClose($hDevFind) | Out-Null
}

$success = $false
if ($found) {
    $flags = if ($Action -eq 'connect') { $BLUETOOTH_SERVICE_ENABLE } else { $BLUETOOTH_SERVICE_DISABLE }
    $anyOk = $false
    foreach ($guid in $serviceGuids) {
        $result = [BtApi]::BluetoothSetServiceState($hRadio, [ref]$deviceInfo, [ref]$guid, $flags)
        if ($result -eq 0) { $anyOk = $true }
    }
    $success = $anyOk
}

[BtApi]::CloseHandle($hRadio) | Out-Null

@{ success = $success } | ConvertTo-Json -Compress
