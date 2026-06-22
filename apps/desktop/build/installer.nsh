!macro customInit
  Push $0
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell"
  StrCmp $0 "" alpine_shell_unlock_done
  StrCmp $0 "explorer.exe" alpine_shell_unlock_done
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "explorer.exe"
  nsExec::Exec 'taskkill /f /im "Alpine Shell.exe"'
  Pop $0
  Sleep 2500
  alpine_shell_unlock_done:
  Pop $0
!macroend

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
