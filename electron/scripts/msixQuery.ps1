$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Get-AppxPackage | ForEach-Object {
    $pkg = $_
    try {
        $manifest = $pkg | Get-AppxPackageManifest
        $startupTasks = $manifest | Select-Xml -XPath '//*[local-name()="Extension"][@Category="windows.startupTask"]'
        if (-not $startupTasks) { return }
        $apps = $manifest | Select-Xml -XPath '//*[local-name()="Application"]'
        $appId = $null
        if ($apps) { $appId = $apps[0].Node.Id }
        foreach ($task in $startupTasks) {
            $st = $task.Node.StartupTask
            if (-not $st) { continue }
            $taskId = $st.TaskId
            $enabled = "$($st.Enabled)".ToLower() -eq 'true'
            $statePath = "HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\$($pkg.PackageFamilyName)\$taskId"
            try {
                $state = (Get-ItemProperty -LiteralPath $statePath -Name State -ErrorAction Stop).State
                $enabled = ($state -eq 2 -or $state -eq 4)
            } catch {}
            Write-Output "$($pkg.PackageFamilyName)!$appId|$taskId|$($st.DisplayName)|$($enabled.ToString().ToLower())"
        }
    } catch {}
}
