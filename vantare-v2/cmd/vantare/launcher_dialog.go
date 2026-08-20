package main

import (
	"errors"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// launcherDialogShower is the narrow dependency the chain-error handler needs
// to ask the user whether to retry a failed profile. It is defined here in
// the consumer (cmd/vantare) so the launcher package stays free of Wails
// imports. The production implementation wraps *application.App; tests use a
// fake.
type launcherDialogShower interface {
	// ShowRetry asks the user "El paso X falló: <message>. ¿Reintentar el
	// perfil desde el inicio?" and returns true when the user accepts.
	ShowRetry(profileID, stepMessage string) bool
}

// wailsLauncherDialog wraps *application.App to show a native question dialog.
// Wails v3 alpha.98 exposes application.MessageDialog via DialogManager. The
// dialog blocks on a channel and we return the user's choice synchronously.
type wailsLauncherDialog struct {
	app *application.App
}

func newWailsLauncherDialog(app *application.App) *wailsLauncherDialog {
	return &wailsLauncherDialog{app: app}
}

// ShowRetry shows a question dialog with two buttons. The user's choice is
// returned via the boolean: true = "Reintentar", false = "Cancelar".
func (w *wailsLauncherDialog) ShowRetry(profileID, stepMessage string) bool {
	if w.app == nil || w.app.Dialog == nil {
		// No UI available (tests, server-only). Fall back to no-retry.
		return false
	}
	responseCh := make(chan bool, 1)
	retry := w.app.Dialog.Question().
		SetTitle("Lanzador Vantare").
		SetMessage("El perfil " + profileID + " falló: " + stepMessage + "\n\n¿Reintentar el perfil desde el inicio?")
	btnRetry := retry.AddButton("Reintentar")
	btnRetry.Callback = func() { responseCh <- true }
	btnCancel := retry.AddButton("Cancelar")
	btnCancel.Callback = func() { responseCh <- false }
	retry.SetDefaultButton(btnRetry)
	retry.SetCancelButton(btnCancel)
	retry.Show()
	select {
	case v, ok := <-responseCh:
		if !ok {
			return false
		}
		return v
	default:
		// User closed the dialog without clicking a button. The OS callback
		// is wired to the cancel button by default; no answer yet means we
		// block until one arrives.
		v, _ := <-responseCh
		return v
	}
}

// launcherFilePicker is the narrow dependency the "Add application" flow
// needs: open the OS file browser and return the executable the user chose.
// It lives in the consumer (cmd/vantare) so the launcher package stays free of
// Wails imports; tests substitute a fake.
type launcherFilePicker interface {
	// PickExecutable returns the selected path. An empty path with a nil error
	// means the user cancelled, which is not a failure.
	PickExecutable() (string, error)
}

// wailsLauncherFilePicker opens the native "open file" dialog. Wails v3
// alpha.98 exposes it through DialogManager.OpenFile(), so the Hub no longer
// has to fall back to the browser's <input type="file"> (which hands over a
// sandboxed File, never a launchable path).
type wailsLauncherFilePicker struct {
	app *application.App
}

func newWailsLauncherFilePicker(app *application.App) *wailsLauncherFilePicker {
	return &wailsLauncherFilePicker{app: app}
}

// PickExecutable shows a single-selection dialog filtered to .exe files. The
// "all files" filter stays available because some launchers ship as .bat/.cmd.
func (w *wailsLauncherFilePicker) PickExecutable() (string, error) {
	if w == nil || w.app == nil || w.app.Dialog == nil {
		return "", errLauncherPickerUnavailable
	}
	return w.app.Dialog.OpenFile().
		SetTitle("Selecciona el ejecutable").
		CanChooseFiles(true).
		CanChooseDirectories(false).
		AddFilter("Programas", "*.exe;*.bat;*.cmd").
		AddFilter("Todos los archivos", "*.*").
		PromptForSingleSelection()
}

// errLauncherPickerUnavailable is returned when no Wails UI is attached, so
// the frontend can disable the browse control instead of showing a mute button.
var errLauncherPickerUnavailable = errors.New("launcher: file picker unavailable")

// logLauncherDialog is a no-UI fallback. Used when the Wails app is not
// available (e.g. early main, tests). It logs and never retries.
type logLauncherDialog struct{}

func (logLauncherDialog) ShowRetry(profileID, stepMessage string) bool {
	log.Printf("launcher: chain error (no dialog available) profile=%s message=%q", profileID, stepMessage)
	return false
}
