//go:build windows

package telemetryanalysis

import (
	"strings"
	"testing"
	"unsafe"

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
	dacl, defaulted, err := descriptor.DACL()
	if err != nil {
		t.Fatalf("DACL() error = %v", err)
	}
	if dacl == nil {
		t.Fatal("security descriptor has no DACL")
	}
	if defaulted {
		t.Fatal("security descriptor uses a defaulted DACL")
	}
	foundCurrentUser := false
	for i := uint16(0); i < dacl.AceCount; i++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(dacl, uint32(i), &ace); err != nil {
			t.Fatalf("GetAce(%d) error = %v", i, err)
		}
		aceSID := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if aceSID.Equals(user.User.Sid) {
			foundCurrentUser = true
			break
		}
	}
	if !foundCurrentUser {
		t.Fatalf("current user missing from DACL: %s", sddl)
	}
}
