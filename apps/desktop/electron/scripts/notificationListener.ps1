$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Emit($obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 4
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications.Management, ContentType = WindowsRuntime] | Out-Null
  [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
} catch {
  Emit @{ type = 'access'; status = 'Unavailable' }
  exit 0
}

function Await($WinRtTask, $ResultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $asTaskGeneric = $asTask.MakeGenericMethod($ResultType)
  $netTask = $asTaskGeneric.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

try {
  $listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
  $status = Await ($listener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
} catch {
  Emit @{ type = 'access'; status = 'Unavailable' }
  exit 0
}

Emit @{ type = 'access'; status = "$status" }
if ("$status" -ne 'Allowed') { exit 0 }

$seen = New-Object 'System.Collections.Generic.HashSet[uint32]'
$firstPoll = $true
$listType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]

while ($true) {
  try {
    $notifs = Await ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) $listType
    $current = New-Object 'System.Collections.Generic.HashSet[uint32]'
    foreach ($n in $notifs) {
      [void]$current.Add($n.Id)
      if ($seen.Contains($n.Id)) { continue }
      [void]$seen.Add($n.Id)
      if ($firstPoll) { continue }
      $appName = ''
      try { $appName = $n.AppInfo.DisplayInfo.DisplayName } catch {}
      $title = ''
      $body = ''
      try {
        $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
        if ($null -ne $binding) {
          $texts = $binding.GetTextElements()
          if ($texts.Count -ge 1) { $title = $texts[0].Text }
          if ($texts.Count -ge 2) {
            $rest = @()
            for ($i = 1; $i -lt $texts.Count; $i++) { $rest += $texts[$i].Text }
            $body = ($rest -join "`n")
          }
        }
      } catch {}
      Emit @{ type = 'notification'; id = [int64]$n.Id; appName = "$appName"; title = "$title"; body = "$body" }
    }
    $stale = @()
    foreach ($id in $seen) { if (-not $current.Contains($id)) { $stale += $id } }
    foreach ($id in $stale) { [void]$seen.Remove($id) }
    $firstPoll = $false
  } catch {}
  Start-Sleep -Seconds 2
}
