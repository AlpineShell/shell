param(
    [ValidateSet('get', 'on', 'off')]
    [string]$Action = 'get'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OperationTimeoutMs = 5000

function Write-Result($State, $ErrorText) {
    @{ state = $State; error = $ErrorText } | ConvertTo-Json -Compress
}

function Initialize-WinRt {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType=WindowsRuntime]
    $script:AsTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
}

function Wait-Operation($Operation, [type]$ResultType) {
    $task = $script:AsTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait($OperationTimeoutMs)) { throw 'timeout' }
    return $task.Result
}

function Get-BluetoothRadios {
    $radioListType = [System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]
    $radios = Wait-Operation ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) $radioListType
    return @($radios | Where-Object { $_.Kind -eq [Windows.Devices.Radios.RadioKind]::Bluetooth })
}

function Get-CombinedState($Radios) {
    if ($Radios.Count -eq 0) { return 'unavailable' }
    $switchedOn = @($Radios | Where-Object { $_.State -eq [Windows.Devices.Radios.RadioState]::On })
    if ($switchedOn.Count -gt 0) { return 'on' }
    return 'off'
}

function Set-BluetoothRadios($Radios, [string]$Target) {
    $access = Wait-Operation ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
    if ($access -ne [Windows.Devices.Radios.RadioAccessStatus]::Allowed) { return 'denied' }
    $state = if ($Target -eq 'on') { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
    $refused = $false
    foreach ($radio in $Radios) {
        $status = Wait-Operation ($radio.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])
        if ($status -ne [Windows.Devices.Radios.RadioAccessStatus]::Allowed) { $refused = $true }
    }
    if ($refused) { return 'denied' }
    return $null
}

try {
    Initialize-WinRt
    $radios = Get-BluetoothRadios
    if ($radios.Count -eq 0) {
        $missingRadio = if ($Action -eq 'get') { $null } else { 'unavailable' }
        Write-Result 'unavailable' $missingRadio
        return
    }
    if ($Action -eq 'get') {
        Write-Result (Get-CombinedState $radios) $null
        return
    }
    $refusal = Set-BluetoothRadios $radios $Action
    Write-Result (Get-CombinedState (Get-BluetoothRadios)) $refusal
} catch {
    Write-Result $null $_.Exception.Message
}
