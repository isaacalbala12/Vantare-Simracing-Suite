Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
; Solo builds QA: /DTEST_INSTALLER aísla registro y accesos, exige /D=<ruta>.
!ifdef TEST_INSTALLER
  !define IDENTITY "VantareNativeBetaQA1492"
  !define SHORTCUT_FOLDER "Vantare Native Beta QA1492"
  InstallDir ""
!else
  !define IDENTITY "VantareNativeBeta"
  !define SHORTCUT_FOLDER "Vantare Native Beta"
  InstallDir "$LOCALAPPDATA\Programs\Vantare Native Beta"
!endif
Name "Vantare Native Beta"
OutFile "${OUTPUT}\VantareSetup.exe"
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

Function .onInit
!ifdef TEST_INSTALLER
  ${If} $INSTDIR == ""
    MessageBox MB_ICONSTOP "La prueba necesita una carpeta aislada mediante /D=<ruta>." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  ${If} $INSTDIR == "$LOCALAPPDATA\Programs\Vantare Native Beta"
    MessageBox MB_ICONSTOP "La prueba no puede usar la instalación real." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
!endif
FunctionEnd

Section "Instalar"
  SetShellVarContext current
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} $0 != $INSTDIR
    StrCpy $INSTDIR $0
  ${EndIf}
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${OUTPUT}\vantare-native-amd64-package.zip"
  File "${BOOTSTRAP}\candidate.ps1"
  File "${BOOTSTRAP}\beta.ps1"
retry_install:
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\beta.ps1" -Operation Install -Root "$INSTDIR" -Archive "$PLUGINSDIR\vantare-native-amd64-package.zip" -ExpectedSha256 "${PACKAGE_SHA}" -NoLaunch'
  Pop $0
  ${If} $0 == 2
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Cierra Vantare para continuar. Si estás en carrera, espera a terminar. Tus datos se conservan." /SD IDCANCEL IDRETRY retry_install
    SetErrorLevel 2
    Abort
  ${EndIf}
  ${If} $0 == 3
    MessageBox MB_ICONSTOP "Ya tienes una versión más reciente de Vantare o de tus datos. Descarga el instalador más reciente. Tus datos se conservan." /SD IDOK
    SetErrorLevel 3
    Abort
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "No se pudo instalar Vantare. Tus datos se conservan. Consulta el detalle de la instalación." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${SHORTCUT_FOLDER}"
  ; Explorer x64 abre System32 directamente; Sysnative solo existe para procesos x86.
  CreateShortcut "$SMPROGRAMS\${SHORTCUT_FOLDER}\Vantare Native Beta.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\beta.ps1" -Root "$INSTDIR"'
  CreateShortcut "$SMPROGRAMS\${SHORTCUT_FOLDER}\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "DisplayName" "Vantare Native Beta"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}" "NoRepair" 1
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
  Delete "$SMPROGRAMS\${SHORTCUT_FOLDER}\Vantare Native Beta.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_FOLDER}\Desinstalar.lnk"
  RMDir "$SMPROGRAMS\${SHORTCUT_FOLDER}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${IDENTITY}"
  Delete "$INSTDIR\beta.ps1"
  Delete "$INSTDIR\candidate.ps1"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
