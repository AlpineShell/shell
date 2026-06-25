param(
    [switch]$Discover,
    [switch]$WithRadio
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$bluetoothDevices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue
$radioEnabled = (($bluetoothDevices | Where-Object { $_.Status -eq 'OK' }).Count -gt 0)

if ($WithRadio -and -not $radioEnabled) {
    @{ enabled = $false; devices = @() } | ConvertTo-Json -Compress
    return
}

$pnp = $bluetoothDevices |
    Where-Object { $_.InstanceId -match '^BTHENUM\\Dev_([0-9a-fA-F]{12})' -or $_.InstanceId -match '^BTHLE\\Dev_([0-9a-fA-F]{12})' } |
    Select-Object FriendlyName, InstanceId

$pairedDevices = @()
$seen = @{}
foreach ($d in $pnp) {
    if (-not $d.FriendlyName) { continue }
    if ($seen[$d.FriendlyName]) { continue }
    $seen[$d.FriendlyName] = $true
    $hex = ''
    if ($d.InstanceId -match 'Dev_([0-9a-fA-F]{12})') { $hex = $Matches[1] }
    $pairedDevices += @{ name = $d.FriendlyName; instanceId = $d.InstanceId; hex = $hex }
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
$null = [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
$null = [Windows.Devices.Bluetooth.BluetoothConnectionStatus, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1)

function Get-Connected($hex) {
    if (-not $hex) { return $false }
    try {
        $addr = [Convert]::ToUInt64($hex, 16)
        $task = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Bluetooth.BluetoothDevice]).Invoke(
            $null, @([Windows.Devices.Bluetooth.BluetoothDevice]::FromBluetoothAddressAsync($addr))
        )
        $null = $task.Wait(2500)
        if ($task.Result) {
            $status = $task.Result.ConnectionStatus
            $task.Result.Dispose()
            if ($status -eq [Windows.Devices.Bluetooth.BluetoothConnectionStatus]::Connected) { return $true }
        }
    } catch {}
    try {
        $addr = [Convert]::ToUInt64($hex, 16)
        $task = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Bluetooth.BluetoothLEDevice]).Invoke(
            $null, @([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr))
        )
        $null = $task.Wait(2500)
        if ($task.Result) {
            $status = $task.Result.ConnectionStatus
            $task.Result.Dispose()
            if ($status -eq [Windows.Devices.Bluetooth.BluetoothConnectionStatus]::Connected) { return $true }
        }
    } catch {}
    return $false
}

$result = @()
foreach ($p in $pairedDevices) {
    $connected = Get-Connected $p.hex
    $result += @{
        name = $p.name
        instanceId = $p.instanceId
        connected = $connected
        paired = $true
    }
}

if ($Discover) {
    $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    try {
        $aqs = "System.Devices.Aep.ProtocolId:=`"{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}`""
        $props = [System.Collections.Generic.List[string]]::new()
        $props.Add('System.Devices.Aep.IsPaired')
        $op = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($aqs, $props, [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)
        $task = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Enumeration.DeviceInformationCollection]).Invoke($null, @($op))
        $null = $task.Wait(8000)
        $discovered = $task.Result

        $pairedNames = @{}
        foreach ($r in $result) { $pairedNames[$r.name] = $true }

        foreach ($d in $discovered) {
            if (-not $d.Name -or $pairedNames[$d.Name]) { continue }
            $isPaired = $false
            try { $isPaired = [bool]$d.Properties['System.Devices.Aep.IsPaired'] } catch {}
            if ($isPaired) { continue }
            $result += @{
                name = $d.Name
                instanceId = $d.Id
                connected = $false
                paired = $false
            }
        }
    } catch {}
}

$sorted = $result | Sort-Object @(
    @{ Expression = { if ($_.connected) { 0 } elseif ($_.paired) { 1 } else { 2 } } }
)

if ($WithRadio) {
    @{ enabled = $radioEnabled; devices = @($sorted) } | ConvertTo-Json -Depth 5 -Compress
} else {
    ConvertTo-Json -InputObject @($sorted) -Compress
}
