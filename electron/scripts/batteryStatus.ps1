Add-Type -AssemblyName System.Windows.Forms
$p = [System.Windows.Forms.SystemInformation]::PowerStatus
$percent = [int]($p.BatteryLifePercent * 100)
$charging = $p.BatteryChargeStatus.HasFlag([System.Windows.Forms.BatteryChargeStatus]::Charging)
$hasBattery = $p.BatteryChargeStatus -ne [System.Windows.Forms.BatteryChargeStatus]::NoSystemBattery
@{ percent = $percent; charging = [bool]$charging; hasBattery = [bool]$hasBattery } | ConvertTo-Json -Compress
