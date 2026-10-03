Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
Name "Vantare Native Beta"
OutFile "${OUTPUT}\VantareSetup.exe"
InstallDir "$LOCALAPPDATA\Programs\Vantare Native Beta"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Vantare Native Beta"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "Instalador Vantare Native Beta"
VIAddVersionKey "LegalCopyright" "Vantare 2026"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION StartHub
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Vantare Native Beta"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Function StartHub
  ; NSIS es x86; Sysnative inicia el host x64 que inspecciona los procesos nativos.
  Exec '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\beta.ps1" -Root "$INSTDIR"'
FunctionEnd

Section "Instalar"
  SetShellVarContext current
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} $0 != $INSTDIR
    MessageBox MB_ICONSTOP "Vantare Native Beta ya está instalado en otra carpeta. Actualízalo desde su Hub." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${OUTPUT}\vantare-native-amd64-package.zip"
  File "${BOOTSTRAP}\candidate.ps1"
  File "${BOOTSTRAP}\beta.ps1"
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\beta.ps1" -Operation Install -Root "$INSTDIR" -Archive "$PLUGINSDIR\vantare-native-amd64-package.zip" -ExpectedSha256 "${PACKAGE_SHA}" -NoLaunch'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "No se pudo instalar. Una instalación existente debe actualizarse desde el Hub; sus datos se conservan." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Vantare Native Beta"
  ; Explorer x64 abre System32 directamente; Sysnative solo existe para procesos x86.
  CreateShortcut "$SMPROGRAMS\Vantare Native Beta\Vantare Native Beta.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\beta.ps1" -Root "$INSTDIR"'
  CreateShortcut "$SMPROGRAMS\Vantare Native Beta\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "DisplayName" "Vantare Native Beta"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\beta.ps1" -Operation Uninstall -Root "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Cierra Vantare Native Beta antes de desinstalar. Los datos se conservan." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  Delete "$SMPROGRAMS\Vantare Native Beta\Vantare Native Beta.lnk"
  Delete "$SMPROGRAMS\Vantare Native Beta\Desinstalar.lnk"
  RMDir "$SMPROGRAMS\Vantare Native Beta"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\VantareNativeBeta"
  Delete "$INSTDIR\beta.ps1"
  Delete "$INSTDIR\candidate.ps1"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
