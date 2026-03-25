Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$typeName = 'System.WindowsRuntimeSystemExtensions'
$asTaskGeneric = ([type]$typeName).GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTask = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$task = $asTask.Invoke($null, @($asyncOp))
$null = $task.Wait(-1)
$global:smtcMgr = $task.Result
$global:asTaskGeneric = $asTaskGeneric
$global:typeName = $typeName
$global:asTaskBool = $asTaskGeneric.MakeGenericMethod([bool])
try {
    $session = $global:smtcMgr.GetCurrentSession()
    if ($session) {
        $session.add_MediaPropertiesChanged({
            [Console]::Error.WriteLine('__MEDIA_EVENT__')
            [Console]::Error.Flush()
        })
        $session.add_PlaybackInfoChanged({
            [Console]::Error.WriteLine('__MEDIA_EVENT__')
            [Console]::Error.Flush()
        })
    }
    $global:smtcMgr.add_CurrentSessionChanged({
        [Console]::Error.WriteLine('__MEDIA_EVENT__')
        [Console]::Error.Flush()
    })
} catch {}

function global:MediaControl($action) {
    $session = $global:smtcMgr.GetCurrentSession()
    if ($null -eq $session) { return '{"success":false}' }
    switch ($action) {
        'play'     { $op = $session.TryPlayAsync() }
        'pause'    { $op = $session.TryPauseAsync() }
        'toggle'   { $op = $session.TryTogglePlayPauseAsync() }
        'next'     { $op = $session.TrySkipNextAsync() }
        'previous' { $op = $session.TrySkipPreviousAsync() }
        default    { return '{"success":false}' }
    }
    $t = $global:asTaskBool.Invoke($null, @($op))
    $null = $t.Wait(-1)
    return (@{ success = $t.Result } | ConvertTo-Json -Compress)
}

function global:MediaInfo() {
    $session = $global:smtcMgr.GetCurrentSession()
    if ($null -eq $session) { return '{}' }
    $asTask2Generic = ([type]$global:typeName).GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $asTask2 = $asTask2Generic.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $infoOp = $session.TryGetMediaPropertiesAsync()
    $task2 = $asTask2.Invoke($null, @($infoOp))
    $null = $task2.Wait(-1)
    $props = $task2.Result
    $thumbnail = $null
    $thumbnailType = $null
    if ($props.Thumbnail) {
        try {
            $asTaskStream = $asTask2Generic.MakeGenericMethod([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $streamOp = $props.Thumbnail.OpenReadAsync()
            $streamTask = $asTaskStream.Invoke($null, @($streamOp))
            $null = $streamTask.Wait(-1)
            $stream = $streamTask.Result
            $thumbnailType = $stream.ContentType
            $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStream($stream)
            $memStream = New-Object System.IO.MemoryStream
            $netStream.CopyTo($memStream)
            $thumbnail = [Convert]::ToBase64String($memStream.ToArray())
            $memStream.Dispose()
            $netStream.Dispose()
            $stream.Dispose()
        } catch {}
    }
    $playback = $session.GetPlaybackInfo()
    $status = $playback.PlaybackStatus
    return (@{ title = $props.Title; artist = $props.Artist; playing = ($status -eq 4); thumbnail = $thumbnail; thumbnailType = $thumbnailType } | ConvertTo-Json -Compress)
}
