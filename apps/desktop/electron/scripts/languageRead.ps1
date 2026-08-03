[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-KeyboardCatalogEntry {
    param([string]$Klid)
    $path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Keyboard Layouts\' + $Klid
    if (-not (Test-Path $path)) { return $null }
    $props = Get-ItemProperty -Path $path
    return [ordered]@{ text = [string]$props.'Layout Text'; display = [string]$props.'Layout Display Name' }
}

function Get-ImeCatalogEntry {
    param([string]$LangId, [string]$Clsid, [string]$ProfileGuid)
    $path = 'HKLM:\SOFTWARE\Microsoft\CTF\TIP\' + $Clsid + '\LanguageProfile\0x0000' + $LangId + '\' + $ProfileGuid
    if (-not (Test-Path $path)) { return $null }
    $props = Get-ItemProperty -Path $path
    return [ordered]@{ text = [string]$props.Description; display = [string]$props.'Display Description' }
}

function Get-LanguageId {
    param([string]$Tag, $Tips)
    foreach ($tip in $Tips) {
        $parts = $tip -split ':', 2
        if ($parts.Count -eq 2 -and $parts[0]) { return $parts[0].ToUpper() }
    }
    try {
        $created = (New-WinUserLanguageList $Tag)[0]
        foreach ($tip in @($created.InputMethodTips)) {
            $parts = $tip -split ':', 2
            if ($parts.Count -eq 2 -and $parts[0]) { return $parts[0].ToUpper() }
        }
    } catch {}
    try {
        $lcid = [System.Globalization.CultureInfo]::GetCultureInfo($Tag).LCID
        if ($lcid -gt 0 -and $lcid -ne 0x1000) { return ('{0:X4}' -f ($lcid -band 0xFFFF)) }
    } catch {}
    return ''
}

if (-not (Get-Command Get-WinUserLanguageList -ErrorAction SilentlyContinue)) {
    ConvertTo-Json -Compress -InputObject ([ordered]@{ availability = 'module-missing' })
    return
}

try {
    $languageList = Get-WinUserLanguageList
    $override = Get-WinUILanguageOverride
    $culture = Get-Culture
    $systemLocale = Get-WinSystemLocale
    $homeLocation = Get-WinHomeLocation

    $defaultInput = $null
    try { $defaultInput = [string](Get-WinDefaultInputMethodOverride).InputMethodTip } catch {}

    $installedDisplay = @()
    try {
        $installedDisplay = @((Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\MUI\UILanguages' -ErrorAction Stop).PSChildName)
    } catch {}

    $switchHotkey = [ordered]@{ hotkey = ''; languageHotkey = ''; layoutHotkey = '' }
    try {
        $toggleKey = Get-Item 'HKCU:\Keyboard Layout\Toggle' -ErrorAction Stop
        $switchHotkey.hotkey = [string]$toggleKey.GetValue('Hotkey')
        $switchHotkey.languageHotkey = [string]$toggleKey.GetValue('Language Hotkey')
        $switchHotkey.layoutHotkey = [string]$toggleKey.GetValue('Layout Hotkey')
    } catch {}

    $keyboardCatalog = [ordered]@{}
    $imeCatalog = [ordered]@{}
    $languages = @()

    foreach ($language in $languageList) {
        $tips = @($language.InputMethodTips)
        foreach ($tip in $tips) {
            $parts = $tip -split ':', 2
            if ($parts.Count -ne 2) { continue }
            $langId = $parts[0]
            $rest = $parts[1]
            if ($rest.StartsWith('{')) {
                if (-not $imeCatalog.Contains($tip)) {
                    $guids = [regex]::Matches($rest, '\{[^}]+\}')
                    if ($guids.Count -eq 2) {
                        $profile = Get-ImeCatalogEntry -LangId $langId -Clsid $guids[0].Value -ProfileGuid $guids[1].Value
                        if ($null -ne $profile) { $imeCatalog[$tip] = $profile }
                    }
                }
            } else {
                $klid = $rest.ToLower()
                if (-not $keyboardCatalog.Contains($klid)) {
                    $entry = Get-KeyboardCatalogEntry -Klid $klid
                    if ($null -ne $entry) { $keyboardCatalog[$klid] = $entry }
                }
            }
        }
        $languages += [ordered]@{
            tag = [string]$language.LanguageTag
            langId = Get-LanguageId -Tag ([string]$language.LanguageTag) -Tips $tips
            autonym = [string]$language.Autonym
            englishName = [string]$language.EnglishName
            localizedName = [string]$language.LocalizedName
            script = [string]$language.ScriptName
            inputMethodTips = $tips
        }
    }

    ConvertTo-Json -Depth 6 -Compress -InputObject ([ordered]@{
        availability = 'ready'
        languages = @($languages)
        displayLanguageOverride = $(if ($null -eq $override) { $null } else { [string]$override.Name })
        effectiveDisplayLanguage = [System.Globalization.CultureInfo]::CurrentUICulture.Name
        installedDisplayLanguages = @($installedDisplay)
        defaultInputMethod = $defaultInput
        regionalFormat = [ordered]@{ tag = [string]$culture.Name; englishName = [string]$culture.EnglishName; nativeName = [string]$culture.NativeName }
        systemLocale = [ordered]@{ tag = [string]$systemLocale.Name; englishName = [string]$systemLocale.EnglishName }
        homeLocation = [ordered]@{ geoId = [int]$homeLocation.GeoId; name = [string]$homeLocation.HomeLocation }
        keyboardCatalog = $keyboardCatalog
        imeCatalog = $imeCatalog
        switchHotkey = $switchHotkey
    })
} catch {
    ConvertTo-Json -Compress -InputObject ([ordered]@{ availability = 'error'; reason = [string]$_.FullyQualifiedErrorId })
}
