param(
    [string]$Address = '',
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$AddressPattern = '^[0-9a-fA-F]{12}$'
$AudioServicePattern = '^BTHENUM\\\{0000(110B|110C|110E|111E)-'
$ProblemDisabled = 22
$ErrorCancelled = 1223
$ElevatedTimeoutMs = 120000

function Write-Result($Success, $ErrorText) {
    @{ success = $Success; error = $ErrorText } | ConvertTo-Json -Compress
}

function Get-DisabledAudioServices([string]$Address) {
    $addressSuffix = "&$($Address.ToUpperInvariant())_"
    return @(Get-PnpDevice -PresentOnly | Where-Object {
        $_.InstanceId -match $AudioServicePattern -and
        $_.InstanceId.ToUpperInvariant().Contains($addressSuffix) -and
        [int]$_.ConfigManagerErrorCode -eq $ProblemDisabled
    })
}

function Enable-DisabledAudioServices([string]$Address) {
    foreach ($service in (Get-DisabledAudioServices $Address)) {
        Enable-PnpDevice -InstanceId $service.InstanceId -Confirm:$false
    }
}

function Test-Cancelled($Exception) {
    for ($current = $Exception; $current; $current = $current.InnerException) {
        if ($current -is [System.ComponentModel.Win32Exception] -and $current.NativeErrorCode -eq $ErrorCancelled) { return $true }
    }
    return $false
}

function Invoke-ElevatedRepair([string]$Address) {
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Address', $Address, '-Elevated')
    try {
        $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru
    } catch {
        if (Test-Cancelled $_.Exception) { Write-Result $false 'cancelled' } else { Write-Result $false $_.Exception.Message }
        return
    }
    $null = $process.Handle
    if (-not $process.WaitForExit($ElevatedTimeoutMs)) {
        Write-Result $false 'timeout'
        return
    }
    if ($process.ExitCode -eq 0) { Write-Result $true $null } else { Write-Result $false 'failed' }
}

if ($Address -notmatch $AddressPattern) {
    Write-Result $false 'invalid-address'
    exit 1
}

if ($Elevated) {
    try {
        Enable-DisabledAudioServices $Address
        exit 0
    } catch {
        exit 1
    }
}

Invoke-ElevatedRepair $Address
