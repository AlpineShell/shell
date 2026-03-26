param(
    [string]$InstanceId,
    [string]$Action
)

$targetHex = ''
if ($InstanceId -match 'Dev_([0-9a-fA-F]{12})') {
    $targetHex = $Matches[1]
}

if (-not $targetHex) {
    @{ success = $false } | ConvertTo-Json -Compress
    return
}

$success = $false

if ($Action -eq 'connect') {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService, Windows.Devices.Bluetooth.Rfcomm, ContentType=WindowsRuntime]
    $null = [Windows.Networking.Sockets.StreamSocket, Windows.Networking.Sockets, ContentType=WindowsRuntime]

    $typeName = 'System.WindowsRuntimeSystemExtensions'
    $asTaskGeneric = ([type]$typeName).GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    $asTaskAction = ([type]$typeName).GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
    } | Select-Object -First 1

    $macLong = [Convert]::ToUInt64($targetHex, 16)

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

            if ($svcResult.Services.Count -gt 0) {
                $svc = $svcResult.Services[0]
                $socket = New-Object Windows.Networking.Sockets.StreamSocket
                try {
                    $connectTask = $asTaskAction.Invoke($null, @($socket.ConnectAsync($svc.ConnectionHostName, $svc.ConnectionServiceName)))
                    $null = $connectTask.Wait(10000)
                } catch {}
                Start-Sleep -Seconds 2
                $socket.Dispose()
                $success = $true
            }
        } catch {}

        $audioGuids = @('0000110B', '0000111E', '0000110E', '0000110C')
        $services = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
            $_.InstanceId -match 'BTHENUM' -and
            $_.InstanceId -match $targetHex -and
            $_.InstanceId -notmatch '^BTHENUM\\Dev_'
        })
        foreach ($svc in $services) {
            foreach ($guid in $audioGuids) {
                if ($svc.InstanceId -match $guid -and $svc.Status -ne 'OK') {
                    Enable-PnpDevice -InstanceId $svc.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
                    $success = $true
                    break
                }
            }
        }

        $btDevice.Dispose()
    }
} elseif ($Action -eq 'disconnect') {
    $audioGuids = @('0000110B', '0000111E', '0000110E', '0000110C')
    $services = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
        $_.InstanceId -match 'BTHENUM' -and
        $_.InstanceId -match $targetHex -and
        $_.InstanceId -notmatch '^BTHENUM\\Dev_'
    })

    foreach ($svc in $services) {
        $isAudio = $false
        foreach ($guid in $audioGuids) {
            if ($svc.InstanceId -match $guid) { $isAudio = $true; break }
        }
        if ($isAudio -and $svc.Status -eq 'OK') {
            Disable-PnpDevice -InstanceId $svc.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
            $success = $true
        }
    }
}

@{ success = $success } | ConvertTo-Json -Compress
