$devices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match '^BTHENUM\\Dev_' } |
    Select-Object FriendlyName, InstanceId

$serviceInstances = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match 'BTHENUM\\{.*}_Dev_([0-9a-f]{12})' }

$connectedAddresses = @{}
foreach ($s in $serviceInstances) {
    if ($s.InstanceId -match '_Dev_([0-9a-f]{12})') {
        $connectedAddresses[$Matches[1]] = $true
    }
}

$result = @()
$seen = @{}
foreach ($d in $devices) {
    if ($seen[$d.FriendlyName]) { continue }
    $seen[$d.FriendlyName] = $true
    $addr = ''
    if ($d.InstanceId -match 'Dev_([0-9a-f]{12})') { $addr = $Matches[1] }
    $result += @{
        name = $d.FriendlyName
        instanceId = $d.InstanceId
        connected = $connectedAddresses.ContainsKey($addr)
    }
}

$sorted = $result | Sort-Object { if ($_.connected) { 0 } else { 1 } }
ConvertTo-Json -InputObject @($sorted) -Compress
