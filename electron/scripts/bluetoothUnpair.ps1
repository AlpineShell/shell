param([string]$InstanceId)

$targetHex = ''
if ($InstanceId -match 'Dev_([0-9a-fA-F]{12})') {
    $targetHex = $Matches[1]
}
if (-not $targetHex) {
    @{ success = $false } | ConvertTo-Json -Compress
    return
}

$success = $false

$sig = @'
[DllImport("BluetoothAPIs.dll", SetLastError=true)]
public static extern uint BluetoothRemoveDevice(ref ulong pAddress);
'@

if (-not ('AlpineShell.BtApi' -as [type])) {
    try { Add-Type -MemberDefinition $sig -Name 'BtApi' -Namespace 'AlpineShell' -ErrorAction Stop } catch {}
}

if ('AlpineShell.BtApi' -as [type]) {
    try {
        $addr = [Convert]::ToUInt64($targetHex, 16)
        $r = [AlpineShell.BtApi]::BluetoothRemoveDevice([ref]$addr)
        if ($r -eq 0) { $success = $true }
    } catch {}
}

if (-not $success) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Enumeration.DeviceUnpairingResult, Windows.Devices.Enumeration, ContentType=WindowsRuntime]

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1)

    $protocols = @(
        '{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}',
        '{bb7bb05e-5972-42b5-94fc-76eaa7084d49}'
    )
    $normalizedTarget = $targetHex.ToLower()

    foreach ($protocol in $protocols) {
        if ($success) { break }
        $aqs = "System.Devices.Aep.ProtocolId:=`"$protocol`""
        $props = [System.Collections.Generic.List[string]]::new()
        $props.Add('System.Devices.Aep.DeviceAddress')

        $discovered = $null
        try {
            $op = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($aqs, $props, [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)
            $task = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Enumeration.DeviceInformationCollection]).Invoke($null, @($op))
            $null = $task.Wait(10000)
            $discovered = $task.Result
        } catch {}
        if (-not $discovered) { continue }

        foreach ($d in $discovered) {
            $addr = ''
            try { $addr = [string]$d.Properties['System.Devices.Aep.DeviceAddress'] } catch {}
            if (-not $addr) { continue }
            $addrNorm = ($addr -replace '[:\-]', '').ToLower()
            if ($addrNorm -ne $normalizedTarget) { continue }
            try {
                $unpairOp = $d.Pairing.UnpairAsync()
                $unpairTask = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Enumeration.DeviceUnpairingResult]).Invoke($null, @($unpairOp))
                $null = $unpairTask.Wait(15000)
                $r = $unpairTask.Result
                $statusName = $r.Status.ToString()
                if ($statusName -eq 'Unpaired' -or $statusName -eq 'AlreadyUnpaired') {
                    $success = $true
                }
            } catch {}
            break
        }
    }
}

@{ success = $success } | ConvertTo-Json -Compress
