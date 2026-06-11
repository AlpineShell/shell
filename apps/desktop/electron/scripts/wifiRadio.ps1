param(
    [string]$Action
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType=WindowsRuntime]
$null = [Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType=WindowsRuntime]
$null = [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType=WindowsRuntime]

$typeName = 'System.WindowsRuntimeSystemExtensions'
$asTaskGeneric = ([type]$typeName).GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

try {
    $reqAccessTask = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Radios.RadioAccessStatus])
    $accessOp = [Windows.Devices.Radios.Radio]::RequestAccessAsync()
    $accessTask = $reqAccessTask.Invoke($null, @($accessOp))
    $null = $accessTask.Wait(5000)

    $radiosTask = $asTaskGeneric.MakeGenericMethod([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
    $radiosOp = [Windows.Devices.Radios.Radio]::GetRadiosAsync()
    $rTask = $radiosTask.Invoke($null, @($radiosOp))
    $null = $rTask.Wait(5000)
    $radios = $rTask.Result

    $found = $false
    $resultState = 'unknown'

    foreach ($radio in $radios) {
        if ($radio.Kind -eq [Windows.Devices.Radios.RadioKind]::WiFi) {
            $found = $true
            if ($Action -eq 'get') {
                $resultState = if ($radio.State -eq [Windows.Devices.Radios.RadioState]::On) { 'on' } else { 'off' }
            } elseif ($Action -eq 'on' -or $Action -eq 'off') {
                $newState = if ($Action -eq 'on') { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
                $setStateTask = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Radios.RadioAccessStatus])
                $op = $radio.SetStateAsync($newState)
                $t = $setStateTask.Invoke($null, @($op))
                $null = $t.Wait(5000)
                $resultState = $Action
            }
            break
        }
    }

    if (-not $found) {
        @{ success = $false; state = 'unavailable' } | ConvertTo-Json -Compress
    } else {
        @{ success = $true; state = $resultState } | ConvertTo-Json -Compress
    }
} catch {
    @{ success = $false; state = 'error'; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
