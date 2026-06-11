!macro customUnInstall
  ${ifNot} ${isUpdated}
    WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "explorer.exe"
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AlpineShell"
    WriteRegDWORD HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "AutoRestartShell" 1
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "RestartApps"
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "EnableXamlStartMenu"
    nsExec::Exec 'schtasks /change /tn "\Microsoft\Windows\Application Experience\StartupAppTask" /enable'
  ${endIf}
!macroend
