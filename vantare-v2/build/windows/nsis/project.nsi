Unicode true

####
## Please note: Template replacements don't work in this file. They are provided with default defines like
## mentioned underneath.
## If the keyword is not defined, "wails_tools.nsh" will populate them.
## If they are defined here, "wails_tools.nsh" will not touch them. This allows you to use this project.nsi manually
## from outside of Wails for debugging and development of the installer.
## 
## For development first make a wails nsis build to populate the "wails_tools.nsh":
## > wails build --target windows/amd64 --nsis
## Then you can call makensis on this file with specifying the path to your binary:
## For a AMD64 only installer:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
## For a ARM64 only installer:
## > makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
## For a installer with both architectures:
## > makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
####
## The following information is taken from the wails_tools.nsh file, but they can be overwritten here.
####
!define INFO_PROJECTNAME    "vantare"
!define INFO_COMPANYNAME    "Vantare"
!define INFO_PRODUCTNAME    "Vantare Simracing Suite"
!define INFO_PRODUCTVERSION "0.1.0.7"
!define INFO_COPYRIGHT      "© 2026 Vantare"
!define PRODUCT_EXECUTABLE  "vantare.exe"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
!ifndef WAILS_INSTALL_SCOPE
    !define WAILS_INSTALL_SCOPE "user"
!endif
!ifndef REQUEST_EXECUTION_LEVEL
    !define REQUEST_EXECUTION_LEVEL "user"
!endif
!ifndef VANTARE_TELEMETRY_RUNTIME
    !error "VANTARE_TELEMETRY_RUNTIME must point to the verified duckdb-v1 runtime."
!endif
!define TELEMETRY_RUNTIME_DIR "$INSTDIR\runtime\telemetry\duckdb-v1"
!define TELEMETRY_RUNTIME_BACKUP "$INSTDIR\runtime\telemetry\duckdb-v1.bak"
####
## Include the wails tools
####
!include "wails_tools.nsh"

# The version information for this two must consist of 4 parts
VIProductVersion "${INFO_PRODUCTVERSION}"
VIFileVersion    "${INFO_PRODUCTVERSION}"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "${INFO_PRODUCTNAME} Installer"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

# Enable HiDPI support. https://nsis.sourceforge.io/Reference/ManifestDPIAware
ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "resources\leftimage.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "resources\headerimage.bmp"
!define MUI_FINISHPAGE_NOAUTOCLOSE # Wait on the INSTFILES page so the user can take a look into the details of the installation steps
!define MUI_ABORTWARNING # This will warn the user if they exit from the installer.

!insertmacro MUI_PAGE_WELCOME # Welcome to the installer page.
# !insertmacro MUI_PAGE_LICENSE "resources\eula.txt" # Adds a EULA page to the installer
!insertmacro MUI_PAGE_DIRECTORY # In which folder install page.
!insertmacro MUI_PAGE_INSTFILES # Installing page.
!insertmacro MUI_PAGE_FINISH # Finished installation page.

!insertmacro MUI_UNPAGE_INSTFILES # Uninstalling page

!insertmacro MUI_LANGUAGE "English" # Set the Language of the installer

## The following two statements can be used to sign the installer and the uninstaller. The path to the binaries are provided in %1
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\..\bin\${INFO_PROJECTNAME}-${ARCH}-installer.exe" # Name of the installer's file.
!if "${WAILS_INSTALL_SCOPE}" == "user"
    InstallDir "$LOCALAPPDATA\Programs\${INFO_PRODUCTNAME}"
!else
    InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"
!endif
ShowInstDetails show # This will always show the installation details.

Function .onInit
   !insertmacro wails.checkArchitecture
FunctionEnd

Function CloseVantareGracefully
	DetailPrint "Cerrando Vantare..."
	# First try a graceful WM_CLOSE (no /F). Wait up to 5 seconds for the app to close.
	nsExec::Exec 'taskkill /IM vantare.exe'
	StrCpy $0 0
	close_loop:
		Sleep 1000
		IntOp $0 $0 + 1
		# Attempt to open the executable exclusively; if locked, the app is still running.
		FileOpen $1 "$INSTDIR\${PRODUCT_EXECUTABLE}" a
		IfErrors 0 close_done
		IntCmp $0 5 close_force 0
		Goto close_loop
	close_force:
		DetailPrint "Forzando cierre de Vantare..."
		nsExec::Exec 'taskkill /F /IM vantare.exe'
		Sleep 2000
		Goto close_done
	close_done:
		# Close the test handle if we managed to open it.
		IfErrors 0 close_close_handle
		Goto close_return
	close_close_handle:
		FileClose $1
	close_return:
		DetailPrint "Vantare cerrado."
FunctionEnd

Function RestoreBackupIfNeeded
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" 0 restore_done
	DetailPrint "Restaurando copia de seguridad..."
	Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"
	Rename "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" "$INSTDIR\${PRODUCT_EXECUTABLE}"
	restore_done:
FunctionEnd

Function RestoreRuntimeBackup
	DetailPrint "Restaurando runtime de telemetria anterior..."
	RMDir /r "${TELEMETRY_RUNTIME_DIR}"
	IfFileExists "${TELEMETRY_RUNTIME_BACKUP}\*.*" 0 runtime_restore_done
	Rename "${TELEMETRY_RUNTIME_BACKUP}" "${TELEMETRY_RUNTIME_DIR}"
	runtime_restore_done:
FunctionEnd

Function WaitWhileFileLocked
	# Wait up to 10 seconds for vantare.exe to become writable.
	StrCpy $0 0
	lock_loop:
		ClearErrors
		FileOpen $1 "$INSTDIR\${PRODUCT_EXECUTABLE}" a
		IfErrors 0 lock_opened
		Sleep 1000
		IntOp $0 $0 + 1
		IntCmp $0 10 lock_timeout 0
		Goto lock_loop
	lock_timeout:
		DetailPrint "No se pudo acceder a vantare.exe; otro proceso lo mantiene bloqueado."
		Abort "La instalacion fallo porque vantare.exe esta en uso. Cierra la aplicacion e intentalo de nuevo."
	lock_opened:
		FileClose $1
		Return
FunctionEnd


Section
	!insertmacro wails.setShellContext

	Call CloseVantareGracefully
	# Finish recovery from an interrupted previous transaction before starting a new one.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" 0 runtime_recovery
	Call RestoreBackupIfNeeded
	runtime_recovery:
	IfFileExists "${TELEMETRY_RUNTIME_BACKUP}\*.*" 0 recovery_done
	Call RestoreRuntimeBackup
	recovery_done:

	!insertmacro wails.webview2runtime

	SetOutPath $INSTDIR

	# Back up the executable and the complete versioned runtime before replacing either.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 install_files
	Call WaitWhileFileLocked
	DetailPrint "Creando copia de seguridad del ejecutable actual..."
	Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"
	ClearErrors
	Rename "$INSTDIR\${PRODUCT_EXECUTABLE}" "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"
	IfErrors executable_backup_failed 0

	install_files:
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\*.*" 0 extract_files
	ClearErrors
	Rename "${TELEMETRY_RUNTIME_DIR}" "${TELEMETRY_RUNTIME_BACKUP}"
	IfErrors runtime_backup_failed 0

	extract_files:
	# Always start from an empty destination, including after an incomplete old install.
	RMDir /r "${TELEMETRY_RUNTIME_DIR}"
	ClearErrors
	!insertmacro wails.files
	SetOutPath "${TELEMETRY_RUNTIME_DIR}"
	File /oname=manifest.json "${VANTARE_TELEMETRY_RUNTIME}\manifest.json"
	File /oname=duckdb.dll "${VANTARE_TELEMETRY_RUNTIME}\duckdb.dll"
	File /oname=vantare-telemetry-reader.exe "${VANTARE_TELEMETRY_RUNTIME}\vantare-telemetry-reader.exe"
	File /oname=sbom.spdx.json "${VANTARE_TELEMETRY_RUNTIME}\sbom.spdx.json"
	File /oname=THIRD_PARTY_NOTICES.md "${VANTARE_TELEMETRY_RUNTIME}\THIRD_PARTY_NOTICES.md"

	IfErrors 0 install_verify
	DetailPrint "Error al extraer los archivos del instalador."
	Call RestoreRuntimeBackup
	Call RestoreBackupIfNeeded
	Abort "La instalacion fallo al extraer archivos. Se restauraron el ejecutable y runtime anteriores."

	runtime_backup_failed:
	DetailPrint "No se pudo respaldar el runtime de telemetria actual."
	Call RestoreBackupIfNeeded
	Abort "La instalacion fallo antes de reemplazar el runtime. Se restauro el ejecutable anterior."

	executable_backup_failed:
	DetailPrint "No se pudo respaldar el ejecutable actual."
	Abort "La instalacion fallo antes de reemplazar archivos."

	install_verify:
	# Verify that the new executable was actually extracted and is not empty.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 restore_and_abort
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\manifest.json" 0 restore_and_abort
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\duckdb.dll" 0 restore_and_abort
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\vantare-telemetry-reader.exe" 0 restore_and_abort
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\sbom.spdx.json" 0 restore_and_abort
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\THIRD_PARTY_NOTICES.md" 0 restore_and_abort
	ClearErrors
	FileOpen $0 "$INSTDIR\${PRODUCT_EXECUTABLE}" r
	IfErrors 0 file_opened
	Goto restore_and_abort
	file_opened:
		FileSeek $0 0 END $1
		FileClose $0
		IntCmp $1 1024 restore_and_abort 0
		Goto install_success

	restore_and_abort:
		DetailPrint "El ejecutable o runtime de telemetria no se extrajo correctamente."
		Call RestoreRuntimeBackup
		Call RestoreBackupIfNeeded
		Abort "La instalacion fallo al verificar los archivos. Se restauraron el ejecutable y runtime anteriores."

	install_success:
	Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"
	RMDir /r "${TELEMETRY_RUNTIME_BACKUP}"

	CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
	CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

	!insertmacro wails.associateFiles
	!insertmacro wails.associateCustomProtocols

	!insertmacro wails.writeUninstaller
SectionEnd
Section "uninstall"
	!insertmacro wails.setShellContext

	RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath
	RMDir /r "${TELEMETRY_RUNTIME_DIR}"

	RMDir /r $INSTDIR

	Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
	Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

	!insertmacro wails.unassociateFiles
	!insertmacro wails.unassociateCustomProtocols

	!insertmacro wails.deleteUninstaller
SectionEnd
