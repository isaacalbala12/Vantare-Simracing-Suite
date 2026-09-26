package main

import "github.com/wailsapp/wails/v3/pkg/application"

// hubNativeMenu uses the OS menu bar and keeps editing commands bound to the
// focused WebView. Only the Hub opts into this menu; overlay windows do not.
func hubNativeMenu(showAbout func()) *application.Menu {
	menu := application.NewMenu()

	file := menu.AddSubmenu("Archivo")
	file.AddRole(application.Quit)
	file.FindByRole(application.Quit).SetLabel("Salir")

	edit := menu.AddSubmenu("Edición")
	for _, item := range []struct {
		role  application.Role
		label string
	}{
		{application.Cut, "Cortar"},
		{application.Copy, "Copiar"},
		{application.Paste, "Pegar"},
		{application.SelectAll, "Seleccionar todo"},
	} {
		edit.AddRole(item.role)
		edit.FindByRole(item.role).SetLabel(item.label)
	}

	view := menu.AddSubmenu("Ver")
	view.AddRole(application.ToggleFullscreen)
	view.FindByRole(application.ToggleFullscreen).SetLabel("Pantalla completa")

	help := menu.AddSubmenu("Ayuda")
	help.Add("Acerca de Vantare").OnClick(func(*application.Context) { showAbout() })

	return menu
}
