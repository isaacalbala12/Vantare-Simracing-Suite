//go:build windows

package launcher

import "golang.org/x/sys/windows/registry"

// readUninstallEntries es un var (seam para tests) que lee el registro de Windows.
// Devuelve las entradas Uninstall de HKLM + WOW6432Node + HKCU.
var readUninstallEntries = func() []discoveredCandidate {
	var out []discoveredCandidate
	roots := []struct {
		root registry.Key
		path string
	}{
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
	}
	for _, r := range roots {
		k, err := registry.OpenKey(r.root, r.path, registry.READ|registry.WOW64_64KEY)
		if err != nil {
			continue
		}
		names, _ := k.ReadSubKeyNames(-1)
		k.Close()
		for _, name := range names {
			sub, err := registry.OpenKey(r.root, r.path+`\`+name, registry.READ|registry.WOW64_64KEY)
			if err != nil {
				continue
			}
			dn, _, _ := sub.GetStringValue("DisplayName")
			loc, _, _ := sub.GetStringValue("InstallLocation")
			pub, _, _ := sub.GetStringValue("Publisher")
			sc, _, _ := sub.GetIntegerValue("SystemComponent")
			pk, _, _ := sub.GetStringValue("ParentKeyName")
			nr, _, _ := sub.GetIntegerValue("NoRemove")
			rt, _, _ := sub.GetStringValue("ReleaseType")
			us, _, _ := sub.GetStringValue("UninstallString")
			sub.Close()
			if dn == "" {
				continue
			}
			out = append(out, discoveredCandidate{
				DisplayName:     dn,
				InstallLocation: loc,
				Publisher:       pub,
				SystemComponent: int(sc),
				ParentKeyName:   pk,
				NoRemove:        int(nr),
				ReleaseType:     rt,
				UninstallString: us,
			})
		}
	}
	return out
}
