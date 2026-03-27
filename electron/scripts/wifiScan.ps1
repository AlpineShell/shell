$currentSsid = $null
$wifiAdapter = Get-NetAdapter | Where-Object { $_.Name -match 'Wi-?Fi|WLAN' -and $_.Status -eq 'Up' } | Select-Object -First 1
if ($wifiAdapter) {
    $profile = Get-NetConnectionProfile -InterfaceAlias $wifiAdapter.Name -ErrorAction SilentlyContinue
    if ($profile) { $currentSsid = $profile.Name }
}

$iface = (netsh wlan show interfaces 2>$null) -join "`n"
if (-not $currentSsid -and $iface -match '(?m)^\s+SSID\s+:\s+(.+)') { $currentSsid = $Matches[1].Trim() }

$output = netsh wlan show networks mode=bssid 2>$null
$networks = @()
$current = $null

foreach ($line in $output) {
    if ($line -match '^\s*SSID\s+\d+\s*:\s*(.*)') {
        if ($current -and $current.ssid) { $networks += $current }
        $current = @{ ssid = $Matches[1].Trim(); signal = 0; security = 'Open'; connected = $false }
    }
    if ($current) {
        if ($line -match '(\d+)%') { $current.signal = [int]$Matches[1] }
        if ($line -match ':\s*(WPA2|WPA3|WPA|WEP|Open)') { $current.security = $Matches[1] }
    }
}
if ($current -and $current.ssid) { $networks += $current }

$seen = @{}
$unique = @()
foreach ($n in $networks) {
    if (-not $seen[$n.ssid]) {
        $seen[$n.ssid] = $true
        if ($currentSsid -and $n.ssid -eq $currentSsid) { $n.connected = $true }
        $unique += $n
    } else {
        for ($i = 0; $i -lt $unique.Count; $i++) {
            if ($unique[$i].ssid -eq $n.ssid -and $n.signal -gt $unique[$i].signal) {
                $unique[$i].signal = $n.signal
            }
        }
    }
}

if ($unique.Count -eq 0 -and $currentSsid) {
    $unique += @{ ssid = $currentSsid; signal = 100; security = 'WPA2'; connected = $true }
}

$sorted = $unique | Sort-Object { if ($_.connected) { 0 } else { 1 } }, { if ($_.security -eq 'Open') { 1 } else { 0 } }, { -$_.signal }
ConvertTo-Json -InputObject @($sorted) -Compress
