$ethernet = Get-NetAdapter | Where-Object { $_.Name -match 'Ethernet|^LAN' -and $_.Name -notmatch 'WLAN' -and $_.PhysicalMediaType -ne 'Unspecified' } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
if ($ethernet) {
    @{ signal = $null; connected = $true; type = 'ethernet'; ssid = $null } | ConvertTo-Json -Compress
    exit
}

$wifi = Get-NetAdapter | Where-Object { $_.Name -match 'Wi-?Fi|WLAN' } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
if (-not $wifi) {
    @{ signal = $null; connected = $false; type = 'wifi'; ssid = $null } | ConvertTo-Json -Compress
    exit
}

$signal = $null
$ssid = $null

$profile = Get-NetConnectionProfile -InterfaceAlias $wifi.Name -ErrorAction SilentlyContinue
if ($profile) { $ssid = $profile.Name }

$iface = (netsh wlan show interfaces 2>$null) -join "`n"
if ($iface -match '(\d+)%') { $signal = [int]$Matches[1] }
if (-not $ssid -and $iface -match '(?m)^\s+SSID\s+:\s+(.+)') { $ssid = $Matches[1].Trim() }

@{ signal = $signal; connected = $true; type = 'wifi'; ssid = $ssid } | ConvertTo-Json -Compress
