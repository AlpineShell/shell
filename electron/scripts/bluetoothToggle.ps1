param(
    [string]$InstanceId,
    [string]$Action
)

if ($Action -eq 'connect') {
    Enable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction SilentlyContinue
} elseif ($Action -eq 'disconnect') {
    Disable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction SilentlyContinue
}

$device = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
$success = if ($Action -eq 'connect') { $device.Status -eq 'OK' } else { $device.Status -ne 'OK' }
@{ success = [bool]$success } | ConvertTo-Json -Compress
