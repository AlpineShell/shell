!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var /GLOBAL CheckboxShell
Var /GLOBAL CheckboxCursor
Var /GLOBAL DoShell
Var /GLOBAL DoCursor
Var /GLOBAL ShowAdvanced
Var /GLOBAL GpoBlocked

!macro customPageAfterChangeDir
  Page custom mainPageCreate mainPageLeave
  Page custom advancedPageCreate advancedPageLeave
!macroend

Function checkGpoShellOverride
  StrCpy $GpoBlocked 0
  nsExec::ExecToStack 'reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v Shell'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $GpoBlocked 1
  ${EndIf}
FunctionEnd

Function mainPageCreate
  StrCpy $DoShell ${BST_CHECKED}
  StrCpy $DoCursor ${BST_CHECKED}
  StrCpy $ShowAdvanced 0

  Call checkGpoShellOverride

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 12u "Alpine Shell Setup"
  Pop $0
  CreateFont $1 "$(^Font)" 14 700
  SendMessage $0 ${WM_SETFONT} $1 1

  ${NSD_CreateLabel} 0 30u 100% 24u "Set Alpine Shell as your default desktop environment and optionally install a custom cursor."
  Pop $0

  ${If} $GpoBlocked == 1
    ${NSD_CreateLabel} 0 56u 100% 12u "Warning: A Group Policy on this machine may prevent shell replacement."
    Pop $0
    CreateFont $1 "$(^Font)" 9 700
    SendMessage $0 ${WM_SETFONT} $1 1
  ${EndIf}

  ${NSD_CreateButton} 0 76u 130u 22u "Install Preset"
  Pop $0
  ${NSD_OnClick} $0 onPresetClick

  ${NSD_CreateButton} 140u 76u 130u 22u "Advanced"
  Pop $0
  ${NSD_OnClick} $0 onAdvancedClick

  nsDialogs::Show
FunctionEnd

Function onPresetClick
  Pop $0
  StrCpy $ShowAdvanced 0
  StrCpy $DoShell ${BST_CHECKED}
  StrCpy $DoCursor ${BST_CHECKED}
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function onAdvancedClick
  Pop $0
  StrCpy $ShowAdvanced 1
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function mainPageLeave
FunctionEnd

Function advancedPageCreate
  ${If} $ShowAdvanced == 0
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 12u "Advanced Setup"
  Pop $0
  CreateFont $1 "$(^Font)" 14 700
  SendMessage $0 ${WM_SETFONT} $1 1

  ${NSD_CreateLabel} 0 30u 100% 12u "Choose which features to configure:"
  Pop $0

  ${NSD_CreateCheckbox} 0 50u 100% 12u "Set as default Desktop Environment (replaces explorer.exe)"
  Pop $CheckboxShell
  ${NSD_Check} $CheckboxShell

  ${NSD_CreateCheckbox} 0 68u 100% 12u "Install custom cursor (Moga White)"
  Pop $CheckboxCursor
  ${NSD_Check} $CheckboxCursor

  nsDialogs::Show
FunctionEnd

Function advancedPageLeave
  ${NSD_GetState} $CheckboxShell $DoShell
  ${NSD_GetState} $CheckboxCursor $DoCursor
FunctionEnd

!macro customInstall
  ${If} $DoShell == ${BST_CHECKED}
    WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AlpineShell" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'

    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell"
    ${If} $0 != "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      MessageBox MB_OK|MB_ICONEXCLAMATION "Shell replacement could not be applied. A Group Policy or system restriction may be blocking this change."
    ${EndIf}
  ${EndIf}

  ${If} $DoCursor == ${BST_CHECKED}
    CreateDirectory "$APPDATA\${PRODUCT_NAME}\cursors"
    CopyFiles /SILENT "$INSTDIR\resources\cursor\Moga White\*.*" "$APPDATA\${PRODUCT_NAME}\cursors"

    WriteRegStr HKCU "Control Panel\Cursors" "" "Alpine Shell"
    WriteRegStr HKCU "Control Panel\Cursors" "Arrow" "$APPDATA\${PRODUCT_NAME}\cursors\Normal Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "Help" "$APPDATA\${PRODUCT_NAME}\cursors\Help Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "AppStarting" "$APPDATA\${PRODUCT_NAME}\cursors\Working In Background.ani"
    WriteRegStr HKCU "Control Panel\Cursors" "Wait" "$APPDATA\${PRODUCT_NAME}\cursors\Busy.ani"
    WriteRegStr HKCU "Control Panel\Cursors" "Crosshair" "$APPDATA\${PRODUCT_NAME}\cursors\Precision Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "IBeam" "$APPDATA\${PRODUCT_NAME}\cursors\Text Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "NWPen" "$APPDATA\${PRODUCT_NAME}\cursors\HandWriting.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "No" "$APPDATA\${PRODUCT_NAME}\cursors\Unavailable.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "SizeNS" "$APPDATA\${PRODUCT_NAME}\cursors\Vertical Resize.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "SizeWE" "$APPDATA\${PRODUCT_NAME}\cursors\Horizontal Resize.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "SizeNWSE" "$APPDATA\${PRODUCT_NAME}\cursors\Diagonal Resize 1.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "SizeNESW" "$APPDATA\${PRODUCT_NAME}\cursors\Diagonal Resize 2.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "SizeAll" "$APPDATA\${PRODUCT_NAME}\cursors\Move.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "UpArrow" "$APPDATA\${PRODUCT_NAME}\cursors\Alternate Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "Hand" "$APPDATA\${PRODUCT_NAME}\cursors\Link Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "Pin" "$APPDATA\${PRODUCT_NAME}\cursors\Location Select.cur"
    WriteRegStr HKCU "Control Panel\Cursors" "Person" "$APPDATA\${PRODUCT_NAME}\cursors\Person Select.cur"

    System::Call 'user32::SystemParametersInfoW(i 0x0057, i 0, i 0, i 0x03)'
  ${EndIf}

  CreateDirectory "$APPDATA\${PRODUCT_NAME}"
  FileOpen $0 "$APPDATA\${PRODUCT_NAME}\.setup-complete" w
  FileWrite $0 "installed"
  FileClose $0

  ${If} $DoShell == ${BST_CHECKED}
    FileOpen $0 "$APPDATA\${PRODUCT_NAME}\.kill-explorer" w
    FileWrite $0 "1"
    FileClose $0
  ${EndIf}
!macroend

!else

!macro customUnInstall
  WriteRegStr HKCU "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "Shell" "explorer.exe"
  DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "AlpineShell"

  WriteRegStr HKCU "Control Panel\Cursors" "" ""
  DeleteRegValue HKCU "Control Panel\Cursors" "Arrow"
  DeleteRegValue HKCU "Control Panel\Cursors" "Help"
  DeleteRegValue HKCU "Control Panel\Cursors" "AppStarting"
  DeleteRegValue HKCU "Control Panel\Cursors" "Wait"
  DeleteRegValue HKCU "Control Panel\Cursors" "Crosshair"
  DeleteRegValue HKCU "Control Panel\Cursors" "IBeam"
  DeleteRegValue HKCU "Control Panel\Cursors" "NWPen"
  DeleteRegValue HKCU "Control Panel\Cursors" "No"
  DeleteRegValue HKCU "Control Panel\Cursors" "SizeNS"
  DeleteRegValue HKCU "Control Panel\Cursors" "SizeWE"
  DeleteRegValue HKCU "Control Panel\Cursors" "SizeNWSE"
  DeleteRegValue HKCU "Control Panel\Cursors" "SizeNESW"
  DeleteRegValue HKCU "Control Panel\Cursors" "SizeAll"
  DeleteRegValue HKCU "Control Panel\Cursors" "UpArrow"
  DeleteRegValue HKCU "Control Panel\Cursors" "Hand"
  DeleteRegValue HKCU "Control Panel\Cursors" "Pin"
  DeleteRegValue HKCU "Control Panel\Cursors" "Person"
  System::Call 'user32::SystemParametersInfoW(i 0x0057, i 0, i 0, i 0x03)'

  RMDir /r "$APPDATA\${PRODUCT_NAME}\cursors"
  Delete "$APPDATA\${PRODUCT_NAME}\.setup-complete"
  RMDir "$APPDATA\${PRODUCT_NAME}"
!macroend

!endif
