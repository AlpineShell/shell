Get-AppxPackage | ForEach-Object {
    $pkg = $_
    try {
        $manifest = $pkg | Get-AppxPackageManifest
        $startupTasks = $manifest | Select-Xml -XPath '//*[local-name()="Extension"][@Category="windows.startupTask"]'
        foreach ($task in $startupTasks) {
            if ($task.Node.StartupTask.Enabled -eq 'true') {
                $apps = $manifest | Select-Xml -XPath '//*[local-name()="Application"]'
                $appId = $apps[0].Node.Id
                Write-Output "$($pkg.PackageFamilyName)!$appId|$($task.Node.StartupTask.DisplayName)"
            }
        }
    } catch {}
}
