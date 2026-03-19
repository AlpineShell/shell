$results = @()

$paths = @(
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
)

foreach ($basePath in $paths) {
    Get-ChildItem $basePath -Recurse -ErrorAction SilentlyContinue |
        Get-ItemProperty -ErrorAction SilentlyContinue |
        Where-Object { $_.LastUsedTimeStop -eq 0 -and $_.LastUsedTimeStart -ne 0 } |
        ForEach-Object {
            $name = $_.PSChildName
            if ($name -match '#') {
                $name = ($name -split '#')[-1]
            }
            $results += $name
        }
}

if ($results.Count -eq 0) {
    Write-Output '{}'
} else {
    @{ active = $true; apps = $results } | ConvertTo-Json -Compress
}
