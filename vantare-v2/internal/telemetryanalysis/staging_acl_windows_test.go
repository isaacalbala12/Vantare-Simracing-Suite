//go:build windows

package telemetryanalysis

import (
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

func TestSecurePrivateDirectoryUsesProtectedCurrentUserDACL(t *testing.T) {
	directory := t.TempDir()
	if err := securePrivateDirectory(directory); err != nil {
		t.Fatalf("securePrivateDirectory() error = %v", err)
	}
	descriptor, err := windows.GetNamedSecurityInfo(directory, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatalf("GetNamedSecurityInfo() error = %v", err)
	}
	sddl := descriptor.String()
	for _, forbidden := range []string{";;;WD)", ";;;BU)", ";;;AU)"} {
		if strings.Contains(sddl, forbidden) {
			t.Fatalf("private DACL contains %q: %s", forbidden, sddl)
		}
	}
	if !strings.Contains(sddl, "D:P") {
		t.Fatalf("DACL is not protected: %s", sddl)
	}
	token, err := windows.OpenCurrentProcessToken()
	if err != nil {
		t.Fatal(err)
	}
	defer token.Close()
	user, err := token.GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sddl, user.User.Sid.String()) {
		t.Fatalf("current user missing from DACL: %s", sddl)
	}
}
