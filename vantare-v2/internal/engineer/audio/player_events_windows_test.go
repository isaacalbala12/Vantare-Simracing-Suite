//go:build windows

package audio

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Execute the production script in Windows PowerShell with a real WPF
// dispatcher. Only the media event source is replaced: no audio device is
// required, and this is deliberately not an acoustic latency measurement.
func TestPlayerScriptMediaEvents(t *testing.T) {
	source, err := os.ReadFile("testdata/media_events.cs")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name    string
		trace   string
		wantErr bool
	}{
		{"ended", "open,opened,play,ended,close", false},
		{"failed-before-open", "open,failed,close", true},
		{"failed-during-play", "open,opened,play,failed,close", true},
		{"open-throws", "open,close", true},
		{"play-throws", "open,opened,play,close", true},
		{"shutdown-without-end", "open,opened,play,shutdown,close", true},
		{"close-throws", "open,opened,play,ended,close", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := `C:\audio\it's ‘ ’ ‚ ‛ $cash; (日本).mp3`
			script := buildPSScript(escapePSQuote(path))
			const creation = "New-Object System.Windows.Media.MediaPlayer"
			if strings.Count(script, creation) != 1 {
				t.Fatal("expected exactly one MediaPlayer construction to replace")
			}
			script = strings.Replace(script, creation, "New-Object MediaEventsFixture", 1)
			prefix := fmt.Sprintf(`& {
$ErrorActionPreference = 'Stop';
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding;
Add-Type -AssemblyName WindowsBase, PresentationCore;
Add-Type -TypeDefinition @'
%s
'@ -ReferencedAssemblies ([System.Windows.Threading.Dispatcher].Assembly.Location), ([System.Windows.Media.MediaPlayer].Assembly.Location);
[MediaEventsFixture]::Scenario = '%s';
[MediaEventsFixture]::ExpectedPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s'));
};
function Start-Sleep { throw 'Artificial playback wait is forbidden' };
`, source, tc.name, base64.StdEncoding.EncodeToString([]byte(path)))
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encodePSCommand(prefix+script))
			cmd.WaitDelay = time.Second
			// Windows PowerShell can send CLIXML progress on stderr during
			// module loading. Keep diagnostics separate from the event trace.
			var diagnostics bytes.Buffer
			cmd.Stderr = &diagnostics
			output, runErr := cmd.Output()
			if ctx.Err() != nil {
				t.Fatalf("script did not finish after its terminal event: %v\n%s\n%s", ctx.Err(), output, diagnostics.String())
			}
			if (runErr != nil) != tc.wantErr {
				t.Fatalf("script error = %v, want error %v\n%s\n%s", runErr, tc.wantErr, output, diagnostics.String())
			}
			trace := strings.ReplaceAll(strings.TrimSpace(string(output)), "\r", "")
			trace = strings.ReplaceAll(trace, "\n", ",")
			if trace != tc.trace {
				t.Fatalf("event trace = %q, want %q (error %v)", trace, tc.trace, runErr)
			}
		})
	}
}

func TestPlayerRejectsMissingMedia(t *testing.T) {
	player := NewPlayer()
	err := player.Play(filepath.Join(t.TempDir(), "missing.mp3"))
	if err == nil {
		t.Fatal("missing media reported successful playback")
	}
	if errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("missing media was not rejected by the player before timeout: %v", err)
	}
}

func TestPlayerCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := NewPlayer().PlayContext(ctx, "unused.mp3"); !errors.Is(err, context.Canceled) {
		t.Fatalf("PlayContext error = %v, want context.Canceled", err)
	}
}
