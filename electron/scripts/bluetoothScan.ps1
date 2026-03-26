param(
    [switch]$Discover
)

$audioGuids = @('0000110B', '0000111E', '0000110E', '0000110C')

$allBtDevices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -match 'BTHENUM' } |
    Select-Object FriendlyName, InstanceId, Status

$parentDevices = $allBtDevices | Where-Object { $_.InstanceId -match '^BTHENUM\\Dev_' }
$serviceDevices = $allBtDevices | Where-Object { $_.InstanceId -notmatch '^BTHENUM\\Dev_' }

$result = @()
$seen = @{}
foreach ($d in $parentDevices) {
    if ($seen[$d.FriendlyName]) { continue }
    $seen[$d.FriendlyName] = $true

    $hex = ''
    if ($d.InstanceId -match 'Dev_([0-9a-fA-F]{12})') { $hex = $Matches[1] }

    $hasActiveAudio = $false
    if ($hex) {
        foreach ($svc in $serviceDevices) {
            if ($svc.InstanceId -match $hex -and $svc.Status -eq 'OK') {
                foreach ($guid in $audioGuids) {
                    if ($svc.InstanceId -match $guid) { $hasActiveAudio = $true; break }
                }
                if ($hasActiveAudio) { break }
            }
        }
    }

    $result += @{
        name = $d.FriendlyName
        instanceId = $d.InstanceId
        connected = $hasActiveAudio
        paired = $true
    }
}

if ($Discover) {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime]

    $typeName = 'System.WindowsRuntimeSystemExtensions'
    $asTaskGeneric = ([type]$typeName).GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1

    $aqsFilter = "System.Devices.Aep.ProtocolId:=`"{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}`""
    $properties = [System.Collections.Generic.List[string]]::new()
    $properties.Add("System.Devices.Aep.IsPaired")
    $properties.Add("System.Devices.Aep.CanPair")
    $properties.Add("System.Devices.Aep.DeviceAddress")

    $findType = [Windows.Devices.Enumeration.DeviceInformationCollection]
    $asTask = $asTaskGeneric.MakeGenericMethod($findType)
    $op = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync(
        $aqsFilter,
        $properties,
        [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint
    )
    $task = $asTask.Invoke($null, @($op))
    $null = $task.Wait(15000)
    $discovered = $task.Result

    $pairedNames = @{}
    foreach ($r in $result) { $pairedNames[$r.name] = $true }

    foreach ($d in $discovered) {
        if (-not $d.Name -or $pairedNames[$d.Name]) { continue }
        $isPaired = $false
        try { $isPaired = $d.Properties["System.Devices.Aep.IsPaired"] } catch {}
        if ($isPaired) { continue }

        $result += @{
            name = $d.Name
            instanceId = $d.Id
            connected = $false
            paired = $false
        }
    }
}

$sorted = $result | Sort-Object @(
    @{ Expression = { if ($_.connected) { 0 } elseif ($_.paired) { 1 } else { 2 } } }
)
ConvertTo-Json -InputObject @($sorted) -Compress
