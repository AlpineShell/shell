!macro customUnInstall
  ExecWait '"$INSTDIR\Alpine Shell.exe" --uninstall-cleanup'
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "explorer.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AlpineShell"
!macroend
