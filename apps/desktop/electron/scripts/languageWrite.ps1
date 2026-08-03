param(
    [string]$Action = '',
    [string]$Tag = '',
    [string]$Tip = '',
    [string]$Values = '',
    [int]$GeoId = 0
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Split-Values {
    param([string]$Raw)
    return @($Raw -split ',' | Where-Object { $_ })
}

function Find-UserLanguage {
    param($LanguageList, [string]$LanguageTag)
    foreach ($item in $LanguageList) {
        if ($item.LanguageTag -eq $LanguageTag) { return $item }
    }
    return $null
}

function Assert-InputMethodsRemain {
    param($LanguageList)
    $total = 0
    foreach ($item in $LanguageList) { $total += @($item.InputMethodTips).Count }
    if ($total -eq 0) { throw 'no-input-methods' }
}

try {
    switch ($Action) {
        'languages' {
            $desired = Split-Values -Raw $Values
            if ($desired.Count -eq 0) { throw 'empty-language-list' }
            $list = Get-WinUserLanguageList
            $existing = @{}
            foreach ($item in $list) { $existing[$item.LanguageTag.ToLower()] = $item }
            $list.Clear()
            foreach ($candidate in $desired) {
                $key = $candidate.ToLower()
                if ($existing.ContainsKey($key)) {
                    $null = $list.Add($existing[$key])
                } else {
                    $created = (New-WinUserLanguageList $candidate)[0]
                    if ($null -eq $created.Autonym) { throw 'unsupported-language' }
                    $null = $list.Add($created)
                }
            }
            if ($list.Count -eq 0) { throw 'empty-language-list' }
            Assert-InputMethodsRemain -LanguageList $list
            Set-WinUserLanguageList -LanguageList $list -Force
        }
        'inputMethods' {
            $desired = Split-Values -Raw $Values
            $list = Get-WinUserLanguageList
            $target = Find-UserLanguage -LanguageList $list -LanguageTag $Tag
            if ($null -eq $target) { throw 'unknown-language' }
            $target.InputMethodTips.Clear()
            foreach ($candidate in $desired) { $null = $target.InputMethodTips.Add($candidate) }
            Assert-InputMethodsRemain -LanguageList $list
            Set-WinUserLanguageList -LanguageList $list -Force
        }
        'defaultInput' {
            if (-not $Tip) { throw 'missing-input-method' }
            Set-WinDefaultInputMethodOverride -InputTip $Tip
        }
        'display' {
            if ($Tag) { Set-WinUILanguageOverride -Language $Tag } else { Set-WinUILanguageOverride }
        }
        'regionalFormat' {
            if (-not $Tag) { throw 'missing-language-tag' }
            Set-Culture -CultureInfo $Tag
        }
        'homeLocation' {
            if ($GeoId -le 0) { throw 'missing-geo-id' }
            Set-WinHomeLocation -GeoId $GeoId
        }
        default { throw 'unknown-action' }
    }
    ConvertTo-Json -Compress -InputObject ([ordered]@{ ok = $true })
} catch {
    $reason = [string]$_.FullyQualifiedErrorId
    if (-not $reason) { $reason = 'write-failed' }
    ConvertTo-Json -Compress -InputObject ([ordered]@{ ok = $false; reason = $reason })
}
