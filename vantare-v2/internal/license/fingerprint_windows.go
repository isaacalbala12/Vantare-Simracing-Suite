//go:build windows

package license

import "golang.org/x/sys/windows/registry"

const machineGUIDPath = `SOFTWARE\Microsoft\Cryptography`
const machineGUIDValue = "MachineGuid"

func readMachineGUIDPlatform() (string, error) {
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, machineGUIDPath, registry.QUERY_VALUE)
	if err != nil {
		return "", err
	}
	defer k.Close()

	value, _, err := k.GetStringValue(machineGUIDValue)
	if err != nil {
		return "", err
	}
	return value, nil
}
