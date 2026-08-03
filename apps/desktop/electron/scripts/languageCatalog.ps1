[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$languages = @()
if (Get-Command New-WinUserLanguageList -ErrorAction SilentlyContinue) {
    foreach ($culture in [System.Globalization.CultureInfo]::GetCultures('SpecificCultures')) {
        try {
            $candidate = (New-WinUserLanguageList $culture.Name)[0]
        } catch {
            continue
        }
        if ($null -eq $candidate.Autonym) { continue }
        $languages += [ordered]@{
            tag = [string]$culture.Name
            autonym = [string]$candidate.Autonym
            englishName = [string]$culture.EnglishName
            localizedName = [string]$candidate.LocalizedName
            defaultTips = @($candidate.InputMethodTips)
        }
    }
}

$layouts = @()
foreach ($entry in (Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Keyboard Layouts' -ErrorAction SilentlyContinue)) {
    $props = Get-ItemProperty -Path $entry.PSPath
    $layouts += [ordered]@{
        klid = $entry.PSChildName.ToLower()
        text = [string]$props.'Layout Text'
        display = [string]$props.'Layout Display Name'
    }
}

$regions = @()
$seenGeoIds = @{}
foreach ($culture in [System.Globalization.CultureInfo]::GetCultures('SpecificCultures')) {
    $region = $null
    try { $region = New-Object System.Globalization.RegionInfo $culture.Name } catch {}
    if ($null -eq $region) { continue }
    if ($seenGeoIds.ContainsKey($region.GeoId)) { continue }
    $seenGeoIds[$region.GeoId] = $true
    $regions += [ordered]@{
        geoId = [int]$region.GeoId
        iso = [string]$region.TwoLetterISORegionName
        englishName = [string]$region.EnglishName
        displayName = [string]$region.DisplayName
    }
}

ConvertTo-Json -Depth 5 -Compress -InputObject ([ordered]@{
    languages = @($languages)
    layouts = @($layouts)
    regions = @($regions)
})
