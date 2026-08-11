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
!define INSTALL_TX_PENDING "$INSTDIR\.vantare-install.pending"
!define INSTALL_TX_PENDING_TEMP "$INSTDIR\.vantare-install.pending.tmp"
!define INSTALL_TX_COMMITTED "$INSTDIR\.vantare-install.committed"
####
## Include the wails tools
####
!include "wails_tools.nsh"

Var TransactionPrior
Var TransactionResult

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

Function WritePendingMarker
	StrCpy $TransactionResult "error"
	Delete "${INSTALL_TX_PENDING_TEMP}"
	IfFileExists "${INSTALL_TX_PENDING_TEMP}" pending_write_done 0
	ClearErrors
	FileOpen $0 "${INSTALL_TX_PENDING_TEMP}" w
	IfErrors pending_write_done
	ClearErrors
	FileWrite $0 "$TransactionPrior"
	IfErrors pending_write_close
	FileClose $0
	ClearErrors
	Rename "${INSTALL_TX_PENDING_TEMP}" "${INSTALL_TX_PENDING}"
	IfErrors pending_write_cleanup
	Call ReadPendingMarker
	StrCmp $TransactionResult "ok" pending_write_done
	Delete "${INSTALL_TX_PENDING}"
	Goto pending_write_done
	pending_write_close:
		FileClose $0
	pending_write_cleanup:
		Delete "${INSTALL_TX_PENDING_TEMP}"
	pending_write_done:
FunctionEnd

Function ReadPendingMarker
	StrCpy $TransactionResult "error"
	StrCpy $TransactionPrior ""
	ClearErrors
	FileOpen $0 "${INSTALL_TX_PENDING}" r
	IfErrors pending_read_done
	ClearErrors
	FileRead $0 $TransactionPrior
	FileClose $0
	IfErrors pending_read_done
	StrCmp $TransactionPrior "both" pending_read_ok
	StrCmp $TransactionPrior "exe" pending_read_ok
	StrCmp $TransactionPrior "runtime" pending_read_ok
	StrCmp $TransactionPrior "none" pending_read_ok pending_read_done
	pending_read_ok:
		StrCpy $TransactionResult "ok"
	pending_read_done:
FunctionEnd

Function WriteCommittedMarker
	StrCpy $TransactionResult "error"
	ClearErrors
	FileOpen $0 "${INSTALL_TX_COMMITTED}" w
	IfErrors committed_write_done
	ClearErrors
	FileWrite $0 "committed"
	FileClose $0
	# Presence is the commit point. Even a short/empty marker caused by a full
	# disk means reentry must retain the already verified new pair, never roll
	# back only one old backup.
	IfFileExists "${INSTALL_TX_COMMITTED}" 0 committed_write_done
	StrCpy $TransactionResult "ok"
	committed_write_done:
FunctionEnd

Function CleanupCommittedTransaction
	# The committed marker is the last item removed. Any cleanup failure therefore
	# remains retryable and can never restore only one member of the old pair.
	StrCpy $TransactionResult "error"
	Delete "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" committed_cleanup_done 0
	RMDir /r "${TELEMETRY_RUNTIME_BACKUP}"
	IfFileExists "${TELEMETRY_RUNTIME_BACKUP}" committed_cleanup_done 0
	Delete "${INSTALL_TX_PENDING}"
	IfFileExists "${INSTALL_TX_PENDING}" committed_cleanup_done 0
	Delete "${INSTALL_TX_COMMITTED}"
	IfFileExists "${INSTALL_TX_COMMITTED}" committed_cleanup_done 0
	StrCpy $TransactionResult "ok"
	committed_cleanup_done:
FunctionEnd

Function RollbackPendingTransaction
	# The pending marker records which members existed before the transaction.
	# Restore each existing member independently; prior absence is restored by
	# deleting the new member. The marker stays until the complete pair is safe.
	StrCpy $TransactionResult "error"
	Call ReadPendingMarker
	StrCmp $TransactionResult "ok" 0 rollback_done

	StrCmp $TransactionPrior "both" rollback_prior_exe
	StrCmp $TransactionPrior "exe" rollback_prior_exe rollback_no_prior_exe
	rollback_prior_exe:
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" rollback_restore_exe rollback_require_old_exe
	rollback_restore_exe:
		Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" rollback_done 0
		ClearErrors
		Rename "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" "$INSTDIR\${PRODUCT_EXECUTABLE}"
		IfErrors rollback_done
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 rollback_done
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" rollback_done 0
		Goto rollback_runtime
	rollback_require_old_exe:
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" rollback_runtime rollback_done
	rollback_no_prior_exe:
		Delete "$INSTDIR\${PRODUCT_EXECUTABLE}"
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" rollback_done 0
		IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" rollback_done 0

	rollback_runtime:
		StrCmp $TransactionPrior "both" rollback_prior_runtime
		StrCmp $TransactionPrior "runtime" rollback_prior_runtime rollback_no_prior_runtime
	rollback_prior_runtime:
		IfFileExists "${TELEMETRY_RUNTIME_BACKUP}" rollback_restore_runtime rollback_require_old_runtime
	rollback_restore_runtime:
		RMDir /r "${TELEMETRY_RUNTIME_DIR}"
		IfFileExists "${TELEMETRY_RUNTIME_DIR}" rollback_done 0
		ClearErrors
		Rename "${TELEMETRY_RUNTIME_BACKUP}" "${TELEMETRY_RUNTIME_DIR}"
		IfErrors rollback_done
		IfFileExists "${TELEMETRY_RUNTIME_DIR}" 0 rollback_done
		IfFileExists "${TELEMETRY_RUNTIME_BACKUP}" rollback_done 0
		Goto rollback_finish
	rollback_require_old_runtime:
		IfFileExists "${TELEMETRY_RUNTIME_DIR}" rollback_finish rollback_done
	rollback_no_prior_runtime:
		RMDir /r "${TELEMETRY_RUNTIME_DIR}"
		IfFileExists "${TELEMETRY_RUNTIME_DIR}" rollback_done 0
		IfFileExists "${TELEMETRY_RUNTIME_BACKUP}" rollback_done 0

	rollback_finish:
		Delete "${INSTALL_TX_PENDING}"
		IfFileExists "${INSTALL_TX_PENDING}" rollback_done 0
		StrCpy $TransactionResult "ok"
	rollback_done:
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

	# FileOpen in the close helper uses append mode and must never synthesize an
	# executable in a fresh or runtime-only incomplete installation.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 close_not_needed
	Call CloseVantareGracefully
	close_not_needed:
	SetOutPath $INSTDIR
	# A committed transaction is always cleaned, never rolled back. A pending
	# transaction is always rolled back according to its recorded prior inventory.
	IfFileExists "${INSTALL_TX_COMMITTED}" 0 recovery_pending
	Call CleanupCommittedTransaction
	StrCmp $TransactionResult "ok" recovery_pending
	Abort "No se pudo completar la limpieza de una instalacion confirmada. Vuelve a ejecutar el instalador."
	recovery_pending:
	IfFileExists "${INSTALL_TX_PENDING}" 0 recovery_orphan_exe
	Call RollbackPendingTransaction
	StrCmp $TransactionResult "ok" recovery_orphan_exe
	Abort "No se pudo restaurar la instalacion anterior. Los datos de recuperacion se conservaron."
	recovery_orphan_exe:
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" 0 recovery_orphan_runtime
	Abort "Se encontro una copia de seguridad sin estado de transaccion. No se modificaron mas archivos."
	recovery_orphan_runtime:
	IfFileExists "${TELEMETRY_RUNTIME_BACKUP}" 0 recovery_pending_temp
	Abort "Se encontro un runtime de respaldo sin estado de transaccion. No se modificaron mas archivos."
	recovery_pending_temp:
	# A temporary pending marker is written before any mutation. It can only be
	# debris from an interruption before the atomic rename to the real marker.
	Delete "${INSTALL_TX_PENDING_TEMP}"
	IfFileExists "${INSTALL_TX_PENDING_TEMP}" 0 recovery_done
	Abort "No se pudo limpiar un marcador temporal anterior; no se reemplazo ningun archivo."
	recovery_done:

	!insertmacro wails.webview2runtime

	# Persist the exact prior inventory before moving or extracting either member.
	StrCpy $TransactionPrior "none"
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 inventory_runtime
	StrCpy $TransactionPrior "exe"
	inventory_runtime:
	IfFileExists "${TELEMETRY_RUNTIME_DIR}" 0 inventory_done
	StrCmp $TransactionPrior "exe" 0 inventory_runtime_only
	StrCpy $TransactionPrior "both"
	Goto inventory_done
	inventory_runtime_only:
	StrCpy $TransactionPrior "runtime"
	inventory_done:
	Call WritePendingMarker
	StrCmp $TransactionResult "ok" transaction_started
	Abort "No se pudo iniciar una transaccion recuperable; no se reemplazo ningun archivo."
	transaction_started:

	# Back up the executable and the complete versioned runtime before replacing either.
	StrCmp $TransactionPrior "both" backup_executable
	StrCmp $TransactionPrior "exe" backup_executable backup_runtime
	backup_executable:
	Call WaitWhileFileLocked
	DetailPrint "Creando copia de seguridad del ejecutable actual..."
	ClearErrors
	Rename "$INSTDIR\${PRODUCT_EXECUTABLE}" "$INSTDIR\${PRODUCT_EXECUTABLE}.bak"
	IfErrors transaction_failed
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}.bak" backup_runtime transaction_failed

	backup_runtime:
	StrCmp $TransactionPrior "both" backup_runtime_present
	StrCmp $TransactionPrior "runtime" backup_runtime_present extract_files
	backup_runtime_present:
	ClearErrors
	Rename "${TELEMETRY_RUNTIME_DIR}" "${TELEMETRY_RUNTIME_BACKUP}"
	IfErrors transaction_failed
	IfFileExists "${TELEMETRY_RUNTIME_BACKUP}" extract_files transaction_failed

	extract_files:
	# Always start from an empty destination, including after an incomplete old install.
	RMDir /r "${TELEMETRY_RUNTIME_DIR}"
	IfFileExists "${TELEMETRY_RUNTIME_DIR}" transaction_failed 0
	ClearErrors
	!insertmacro wails.files
	SetOutPath "${TELEMETRY_RUNTIME_DIR}"
	File /oname=manifest.json "${VANTARE_TELEMETRY_RUNTIME}\manifest.json"
	File /oname=duckdb.dll "${VANTARE_TELEMETRY_RUNTIME}\duckdb.dll"
	File /oname=vantare-telemetry-reader.exe "${VANTARE_TELEMETRY_RUNTIME}\vantare-telemetry-reader.exe"
	File /oname=sbom.spdx.json "${VANTARE_TELEMETRY_RUNTIME}\sbom.spdx.json"
	File /oname=THIRD_PARTY_NOTICES.md "${VANTARE_TELEMETRY_RUNTIME}\THIRD_PARTY_NOTICES.md"

	IfErrors transaction_failed

	# Verify that the new executable was actually extracted and is not empty.
	IfFileExists "$INSTDIR\${PRODUCT_EXECUTABLE}" 0 transaction_failed
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\manifest.json" 0 transaction_failed
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\duckdb.dll" 0 transaction_failed
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\vantare-telemetry-reader.exe" 0 transaction_failed
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\sbom.spdx.json" 0 transaction_failed
	IfFileExists "${TELEMETRY_RUNTIME_DIR}\THIRD_PARTY_NOTICES.md" 0 transaction_failed
	ClearErrors
	FileOpen $0 "$INSTDIR\${PRODUCT_EXECUTABLE}" r
	IfErrors 0 file_opened
	Goto transaction_failed
	file_opened:
		FileSeek $0 0 END $1
		FileClose $0
		IntCmp $1 1024 transaction_failed 0

	Call WriteCommittedMarker
	StrCmp $TransactionResult "ok" transaction_committed transaction_failed
	transaction_committed:
	Call CleanupCommittedTransaction
	StrCmp $TransactionResult "ok" install_success
	Abort "La instalacion nueva esta confirmada, pero no se pudieron limpiar los respaldos. Vuelve a ejecutar el instalador."

	transaction_failed:
		DetailPrint "La transaccion de instalacion fallo; restaurando el estado anterior completo..."
		Call RollbackPendingTransaction
		StrCmp $TransactionResult "ok" transaction_rolled_back
		Abort "La instalacion fallo y la recuperacion no pudo completarse. Los datos de recuperacion se conservaron."
	transaction_rolled_back:
		Abort "La instalacion fallo. Se restauro el estado anterior del ejecutable y runtime."

	install_success:
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
