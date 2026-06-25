[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$radioSuccess = $false
$radioState = 'unknown'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType=WindowsRuntime]
    $null = [Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType=WindowsRuntime]

    $asTaskGeneric = ([type]'System.WindowsRuntimeSystemExtensions').GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1

    $reqAccessTask = $asTaskGeneric.MakeGenericMethod([Windows.Devices.Radios.RadioAccessStatus])
    $accessOp = [Windows.Devices.Radios.Radio]::RequestAccessAsync()
    $accessTask = $reqAccessTask.Invoke($null, @($accessOp))
    $null = $accessTask.Wait(5000)

    $radiosTask = $asTaskGeneric.MakeGenericMethod([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
    $radiosOp = [Windows.Devices.Radios.Radio]::GetRadiosAsync()
    $rTask = $radiosTask.Invoke($null, @($radiosOp))
    $null = $rTask.Wait(5000)
    $radios = $rTask.Result

    foreach ($radio in $radios) {
        if ($radio.Kind -eq [Windows.Devices.Radios.RadioKind]::WiFi) {
            $radioSuccess = $true
            $radioState = if ($radio.State -eq [Windows.Devices.Radios.RadioState]::On) { 'on' } else { 'off' }
            break
        }
    }
} catch {
    $radioSuccess = $false
    $radioState = 'error'
}

$ethernet = Get-NetAdapter | Where-Object { $_.Name -match 'Ethernet|^LAN' -and $_.Name -notmatch 'WLAN' -and $_.PhysicalMediaType -ne 'Unspecified' } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
if ($ethernet) {
    @{ signal = $null; connected = $true; type = 'ethernet'; ssid = $null; radioSuccess = $radioSuccess; radioState = $radioState } | ConvertTo-Json -Compress
    exit
}

$wifi = Get-NetAdapter | Where-Object { $_.Name -match 'Wi-?Fi|WLAN' } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
if (-not $wifi) {
    @{ signal = $null; connected = $false; type = 'wifi'; ssid = $null; radioSuccess = $radioSuccess; radioState = $radioState } | ConvertTo-Json -Compress
    exit
}

$signal = $null
$ssid = $null

$profile = Get-NetConnectionProfile -InterfaceAlias $wifi.Name -ErrorAction SilentlyContinue
if ($profile) { $ssid = $profile.Name }

$iface = (netsh wlan show interfaces 2>$null) -join "`n"
if ($iface -match '(\d+)%') { $signal = [int]$Matches[1] }
if (-not $ssid -and $iface -match '(?m)^\s+SSID\s+:\s+(.+)') { $ssid = $Matches[1].Trim() }

@{ signal = $signal; connected = $true; type = 'wifi'; ssid = $ssid; radioSuccess = $radioSuccess; radioState = $radioState } | ConvertTo-Json -Compress
