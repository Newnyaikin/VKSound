Unicode true
!include "MUI2.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "1.0.1"
!endif
!define APP_NAME "VKSound"
!define APP_EXE "VKSound.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VKSound"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "artifacts\VKSound-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\VKSound"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить VKSound"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Section "VKSound" SEC_MAIN
  SectionIn RO
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r /x ".vksound-build.json" "artifacts\win-unpacked\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\VKSound"
  CreateShortcut "$SMPROGRAMS\VKSound\VKSound.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\VKSound\Удалить VKSound.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\VKSound.lnk" "$INSTDIR\${APP_EXE}"

  SetRegView 64
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "VKSound"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "VKSound contributors"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  Delete "$SMPROGRAMS\VKSound\VKSound.lnk"
  Delete "$SMPROGRAMS\VKSound\Удалить VKSound.lnk"
  RMDir "$SMPROGRAMS\VKSound"
  Delete "$DESKTOP\VKSound.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  RMDir /r "$INSTDIR"
SectionEnd
