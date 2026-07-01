!macro customInit
  Push $0
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell"
  StrCmp $0 "" alpine_shell_unlock_done
  StrCmp $0 "explorer.exe" alpine_shell_unlock_done
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "explorer.exe"
  nsExec::Exec 'taskkill /f /im "Alpine Shell.exe"'
  Pop $0
  Push $1
  Push $2
  Push $3
  Push $4
  StrCpy $1 0
  alpine_shell_wait_loop:
    nsExec::ExecToStack 'tasklist /nh /fo csv /fi "imagename eq Alpine Shell.exe"'
    Pop $0
    Pop $0
    StrLen $3 $0
    IntOp $3 $3 - 16
    StrCpy $2 0
    alpine_shell_scan_loop:
      IntCmp $2 $3 0 0 alpine_shell_process_gone
      StrCpy $4 $0 16 $2
      StrCmp $4 "Alpine Shell.exe" alpine_shell_process_present
      IntOp $2 $2 + 1
      Goto alpine_shell_scan_loop
    alpine_shell_process_present:
      IntOp $1 $1 + 1
      IntCmp $1 30 alpine_shell_settle 0 alpine_shell_settle
      Sleep 150
      Goto alpine_shell_wait_loop
  alpine_shell_process_gone:
  alpine_shell_settle:
    Sleep 250
  Pop $4
  Pop $3
  Pop $2
  Pop $1
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
