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
!define INFO_PRODUCTVERSION "0.1.0.3"
!define INFO_COPYRIGHT      "© 2026 Vantare"
!define PRODUCT_EXECUTABLE  "vantare.exe"
###
## !define PRODUCT_EXECUTABLE  "Application.exe"      # Default "${INFO_PROJECTNAME}.exe"
## !define UNINST_KEY_NAME     "UninstKeyInRegistry"  # Default "${INFO_COMPANYNAME}${INFO_PRODUCTNAME}"
####
!define REQUEST_EXECUTION_LEVEL "user"
!define WAILS_INSTALL_SCOPE     "user"
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

	!insertmacro wails.webview2runtime

	SetOutPath $INSTDIR

	# If a previous executable exists, wait until it is not locked, then back it up.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 install_files
	Call WaitWhileFileLocked
	DetailPrint "Creando copia de seguridad del ejecutable actual..."
	Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"
	Rename "$INSTDIR\${PRODUCT_EXECUTABLE}" "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"

	install_files:
	!insertmacro wails.files

	IfErrors 0 install_verify
	DetailPrint "Error al extraer los archivos del instalador."
	Call RestoreBackupIfNeeded
	Abort "La instalacion fallo al extraer archivos. Se ha restaurado la version anterior."

	install_verify:
	# Verify that the new executable was actually extracted and is not empty.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 restore_and_abort
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
		DetailPrint "vantare.exe no se extrajo correctamente."
		Call RestoreBackupIfNeeded
		Abort "La instalacion fallo porque no se pudo copiar el nuevo ejecutable. Se ha restaurado la version anterior."

	install_success:
	Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"

	CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
	CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

	!insertmacro wails.associateFiles
	!insertmacro wails.associateCustomProtocols

	!insertmacro wails.writeUninstaller
SectionEnd
Section "uninstall"
	!insertmacro wails.setShellContext

	RMDir /r "$AppData\${PRODUCT_EXECUTABLE}" # Remove the WebView2 DataPath

	RMDir /r $INSTDIR

	Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
	Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

	!insertmacro wails.unassociateFiles
	!insertmacro wails.unassociateCustomProtocols

	!insertmacro wails.deleteUninstaller
SectionEnd
