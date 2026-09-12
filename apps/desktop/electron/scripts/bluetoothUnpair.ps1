param(
    [string]$ClassicAddress = '',
    [string]$LeAddress = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$AddressPattern = '^[0-9a-fA-F]{12}$'
$OperationTimeoutMs = 10000
$ErrorNotFound = 1168
$ClassicProtocol = '{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}'
$LeProtocol = '{bb7bb05e-5972-42b5-94fc-76eaa7084d49}'
$Failures = [System.Collections.Generic.List[string]]::new()

function Write-Result($Classic, $Le, $ErrorText) {
    @{ classic = $Classic; le = $Le; error = $ErrorText } | ConvertTo-Json -Compress
}

function Test-OptionalAddress([string]$Address) {
    return (-not $Address) -or ($Address -match $AddressPattern)
}

function Initialize-WinRt {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Enumeration.DeviceUnpairingResult, Windows.Devices.Enumeration, ContentType=WindowsRuntime]
    $script:AsTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
}

function Wait-Operation($Operation, [type]$ResultType) {
    $task = $script:AsTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait($OperationTimeoutMs)) { throw 'timeout' }
    return $task.Result
}

function Find-PairedEndpoint([string]$Address, [string]$Protocol) {
    $query = "System.Devices.Aep.ProtocolId:=`"$Protocol`" AND System.Devices.Aep.IsPaired:=System.StructuredQueryType.Boolean#True AND System.Devices.Aep.Bluetooth.IssueInquiry:=System.StructuredQueryType.Boolean#False"
    $properties = [System.Collections.Generic.List[string]]::new()
    $properties.Add('System.Devices.Aep.DeviceAddress')
    $operation = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($query, $properties, [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)
    $endpoints = Wait-Operation $operation ([Windows.Devices.Enumeration.DeviceInformationCollection])
    foreach ($endpoint in $endpoints) {
        $endpointAddress = [string]$endpoint.Properties['System.Devices.Aep.DeviceAddress']
        if (($endpointAddress -replace '[:\-]', '') -eq $Address) { return $endpoint }
    }
    return $null
}

function Remove-EndpointPairing([string]$Address, [string]$Protocol, [string]$WhenMissing) {
    $endpoint = Find-PairedEndpoint $Address $Protocol
    if (-not $endpoint) { return $WhenMissing }
    $result = Wait-Operation ($endpoint.Pairing.UnpairAsync()) ([Windows.Devices.Enumeration.DeviceUnpairingResult])
    $status = $result.Status.ToString()
    if ($status -eq 'Unpaired' -or $status -eq 'AlreadyUnpaired') { return 'removed' }
    $Failures.Add("unpair $status")
    return 'failed'
}

function Remove-ClassicBond([string]$Address) {
    if (-not ('AlpineShell.BtApi' -as [type])) {
        Add-Type -Name 'BtApi' -Namespace 'AlpineShell' -MemberDefinition @'
[DllImport("BluetoothAPIs.dll", SetLastError=true)]
public static extern uint BluetoothRemoveDevice(ref ulong pAddress);
'@
    }
    $value = [Convert]::ToUInt64($Address, 16)
    $code = [AlpineShell.BtApi]::BluetoothRemoveDevice([ref]$value)
    if ($code -eq 0) { return 'removed' }
    if ($code -eq $ErrorNotFound) { return 'absent' }
    $Failures.Add("BluetoothRemoveDevice $code")
    return (Remove-EndpointPairing $Address $ClassicProtocol 'failed')
}

function Invoke-Removal([scriptblock]$Removal) {
    try {
        return (& $Removal)
    } catch {
        $Failures.Add($_.Exception.Message)
        return 'failed'
    }
}

if (-not (Test-OptionalAddress $ClassicAddress) -or -not (Test-OptionalAddress $LeAddress) -or (-not $ClassicAddress -and -not $LeAddress)) {
    Write-Result $null $null 'invalid-address'
    return
}

try { Initialize-WinRt } catch { $Failures.Add($_.Exception.Message) }

$classic = if ($ClassicAddress) { Invoke-Removal { Remove-ClassicBond $ClassicAddress } } else { $null }
$le = if ($LeAddress) { Invoke-Removal { Remove-EndpointPairing $LeAddress $LeProtocol 'absent' } } else { $null }
$errorText = if ($Failures.Count -gt 0) { $Failures -join '; ' } else { $null }
Write-Result $classic $le $errorText
