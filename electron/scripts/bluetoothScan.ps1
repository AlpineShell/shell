$DN_DEVICE_DISCONNECTED = 0x02000000

$devices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match '^BTHENUM\\Dev_' } |
    Select-Object FriendlyName, InstanceId, Status

$result = @()
$seen = @{}
foreach ($d in $devices) {
    if ($seen[$d.FriendlyName]) { continue }
    $seen[$d.FriendlyName] = $true

    $devNodeStatus = (Get-PnpDeviceProperty -InstanceId $d.InstanceId `
        -KeyName 'DEVPKEY_Device_DevNodeStatus' -ErrorAction SilentlyContinue).Data

    $isDisconnected = ($devNodeStatus -band $DN_DEVICE_DISCONNECTED) -ne 0
    $isConnected = (-not $isDisconnected) -and ($d.Status -eq 'OK')

    $result += @{
        name = $d.FriendlyName
        instanceId = $d.InstanceId
        connected = $isConnected
        paired = -not $isConnected
    }
}

$sorted = $result | Sort-Object { if ($_.connected) { 0 } else { 1 } }
ConvertTo-Json -InputObject @($sorted) -Compress
