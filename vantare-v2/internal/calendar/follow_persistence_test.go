package calendar

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestFollowPersistenceFailurePreservesStateAndAllowsRetry(t *testing.T) {
	for _, series := range []bool{false, true} {
		for _, following := range []bool{false, true} {
			name := map[bool]string{false: "event", true: "series"}[series] + "/" + map[bool]string{false: "unfollow", true: "follow"}[following]
			t.Run(name, func(t *testing.T) {
				now := time.Date(2026, time.August, 25, 12, 0, 0, 0, time.UTC)
				svc := newTempService(t, now)
				if err := svc.Load(); err != nil {
					t.Fatal(err)
				}
				if err := svc.ApplyOfficialSchedule(now); err != nil {
					t.Fatal(err)
				}
				cal := svc.Calendar()
				id := cal.Events[0].ID
				follow, unfollow, isFollowed := svc.Follow, svc.Unfollow, svc.IsFollowed
				if series {
					id = cal.Series[0].ID
					follow, unfollow, isFollowed = svc.FollowSeries, svc.UnfollowSeries, svc.IsSeriesFollowed
				}
				action := follow
				if !following {
					if _, err := follow(id); err != nil {
						t.Fatal(err)
					}
					action = unfollow
				}
				before := svc.Calendar()
				path := svc.Path()
				stored, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				// A file cannot be the parent directory of the destination.
				blocker := filepath.Join(t.TempDir(), "file")
				if err := os.WriteFile(blocker, []byte("block"), 0600); err != nil {
					t.Fatal(err)
				}
				svc.path = filepath.Join(blocker, FileName)
				if _, err := action(id); err == nil {
					t.Fatal("expected persistence error")
				}
				svc.path = path
				if !reflect.DeepEqual(svc.Calendar(), before) {
					t.Error("failed save changed in-memory calendar")
				}
				after, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(stored, after) {
					t.Error("failed save changed saved calendar")
				}
				if _, err := action(id); err != nil {
					t.Fatalf("retry: %v", err)
				}
				if isFollowed(id) != following {
					t.Error("retry did not apply requested preference")
				}
				if err := svc.Load(); err != nil {
					t.Fatal(err)
				}
				if isFollowed(id) != following {
					t.Error("retry did not persist requested preference")
				}
			})
		}
	}
}
