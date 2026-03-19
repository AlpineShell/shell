Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$typeName = 'System.WindowsRuntimeSystemExtensions'
$asTaskGeneric = ([type]$typeName).GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTask = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$task = $asTask.Invoke($null, @($asyncOp))
$null = $task.Wait(-1)
$mgr = $task.Result
$session = $mgr.GetCurrentSession()
if ($null -eq $session) { Write-Output '{}'; exit }
$infoOp = $session.TryGetMediaPropertiesAsync()
$asTask2Generic = ([type]$typeName).GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTask2 = $asTask2Generic.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$task2 = $asTask2.Invoke($null, @($infoOp))
$null = $task2.Wait(-1)
$props = $task2.Result
$playback = $session.GetPlaybackInfo()
$status = $playback.PlaybackStatus
$obj = @{ title = $props.Title; artist = $props.Artist; playing = ($status -eq 4) }
$obj | ConvertTo-Json -Compress
