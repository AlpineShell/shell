!macro customInit
  Push $R0
  ${StdUtils.GetParameter} $R0 "stage-to" ""
  ${if} $R0 != ""
    !ifdef APP_64
      InitPluginsDir
      !ifdef COMPRESS
        SetCompress off
      !endif
      File /oname=$PLUGINSDIR\app-64.${COMPRESSION_METHOD} "${APP_64}"
      !ifdef COMPRESS
        SetCompress "${COMPRESS}"
      !endif
      CreateDirectory "$R0"
      SetOutPath "$R0"
      ClearErrors
      Nsis7z::Extract "$PLUGINSDIR\app-64.${COMPRESSION_METHOD}"
      IfErrors alpine_stage_failed
      IfFileExists "$R0\${APP_EXECUTABLE_FILENAME}" 0 alpine_stage_failed
      Pop $R0
      !insertmacro quitSuccess
      alpine_stage_failed:
      Pop $R0
      SetErrorLevel 1
      Quit
    !else
      Pop $R0
      SetErrorLevel 1
      Quit
    !endif
  ${endIf}
  Pop $R0

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
    Push $0
    Push $1
    ReadRegStr $1 HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell"
    IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 alpine_uninstall_try_registered
    nsExec::Exec /TIMEOUT=20000 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --uninstall-cleanup'
    Pop $0
    Goto alpine_uninstall_cleanup_done
    alpine_uninstall_try_registered:
    StrCmp $1 "" alpine_uninstall_cleanup_done
    StrCmp $1 "explorer.exe" alpine_uninstall_cleanup_done
    IfFileExists "$1" 0 alpine_uninstall_cleanup_done
    nsExec::Exec /TIMEOUT=20000 '"$1" --uninstall-cleanup'
    Pop $0
    alpine_uninstall_cleanup_done:
    ClearErrors
    ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "AutoRestartShell"
    ${ifNot} ${Errors}
    ${andIf} $0 == 0
      WriteRegDWORD HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "AutoRestartShell" 1
    ${endIf}
    WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "explorer.exe"
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AlpineShell"
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "RestartApps"
    DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced" "EnableXamlStartMenu"
    DeleteRegValue HKCU "Software\Microsoft\DirectX\UserGpuPreferences" "$INSTDIR\Alpine Shell.exe"
    StrCmp $1 "" +2
    DeleteRegValue HKCU "Software\Microsoft\DirectX\UserGpuPreferences" "$1"
    nsExec::Exec 'schtasks /change /tn "\Microsoft\Windows\Application Experience\StartupAppTask" /enable'
    Pop $0
    Pop $1
    Pop $0
  ${endIf}
!macroend
