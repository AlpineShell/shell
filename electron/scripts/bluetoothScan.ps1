$devices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match '^BTHENUM\\Dev_' } |
    Select-Object FriendlyName, Status, InstanceId

$result = @()
$seen = @{}
foreach ($d in $devices) {
    if ($seen[$d.FriendlyName]) { continue }
    $seen[$d.FriendlyName] = $true
    $result += @{
        name = $d.FriendlyName
        instanceId = $d.InstanceId
        connected = ($d.Status -eq 'OK')
    }
}

$sorted = $result | Sort-Object { $_.connected } -Descending
ConvertTo-Json -InputObject @($sorted) -Compress
