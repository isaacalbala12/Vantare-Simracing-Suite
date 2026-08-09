// Package notify raises desktop notifications for work that finishes while the
// user is not looking at Vantare.
//
// The first attempt at this went through the browser's Notification API, which
// WebView2 does not wire up: asking for permission did nothing at all and no
// notification could ever be delivered. Wails ships a service that speaks to
// the platform directly -- Windows toasts -- and that is what Backend is.
package notify

import (
	"fmt"
	"runtime"
)

// Backend is the platform notifier. The Wails notifications service satisfies
// it through a small adapter in main; keeping it an interface is what lets the
// decisions below be tested without a desktop.
type Backend interface {
	RequestAuthorization() (bool, error)
	Authorized() (bool, error)
	Send(title, body string) error
}

// Service decides whether a notification should be raised at all. Three things
// have to agree: the user asked for them, the platform allows them, and the
// window is out of sight -- a toast for something the user is already watching
// is just noise.
type Service struct {
	backend  Backend
	enabled  func() bool
	hidden   func() bool
	requests chan func()
}

// New builds the service. A nil backend means the platform has no notifier, and
// every call becomes a no-op rather than a crash.
//
// It also claims one OS thread for the lifetime of the process. Windows toasts
// go through WinRT, whose apartment model is a property of the calling thread
// and cannot be changed once set: calling from a plain goroutine meant landing
// on whichever thread the scheduler happened to pick, and if something had
// already put that thread in a single-threaded apartment the call failed with
// "cannot change thread mode after it is set". A locked thread runs only its
// own goroutine, so once this one is ours nothing else can change its
// apartment underneath us.
func New(backend Backend, enabled func() bool, hidden func() bool) *Service {
	service := &Service{backend: backend, enabled: enabled, hidden: hidden}
	if backend != nil {
		service.requests = make(chan func())
		go service.serve()
	}
	return service
}

func (s *Service) serve() {
	// Never unlocked: releasing the thread would put it back in the pool with
	// its apartment already set, which is the very state that broke this.
	runtime.LockOSThread()
	for request := range s.requests {
		request()
	}
}

// onOwnThread runs a platform call on the thread this service owns and waits
// for it. Every call into the backend goes through here, so the platform only
// ever sees one thread.
func (s *Service) onOwnThread(call func() error) error {
	if s.requests == nil {
		return call()
	}
	done := make(chan error, 1)
	s.requests <- func() { done <- call() }
	return <-done
}

// Supported reports whether this build can raise notifications at all, so the
// settings page can say so instead of offering a switch that cannot work.
func (s *Service) Supported() bool {
	return s != nil && s.backend != nil
}

// Authorized reports whether the platform currently allows notifications,
// without asking the user anything.
func (s *Service) Authorized() (bool, error) {
	if !s.Supported() {
		return false, nil
	}
	var authorized bool
	err := s.onOwnThread(func() error {
		var callErr error
		authorized, callErr = s.backend.Authorized()
		return callErr
	})
	return authorized, err
}

// RequestAuthorization asks the platform, which may prompt the user.
func (s *Service) RequestAuthorization() (bool, error) {
	if !s.Supported() {
		return false, nil
	}
	var granted bool
	err := s.onOwnThread(func() error {
		var callErr error
		granted, callErr = s.backend.RequestAuthorization()
		return callErr
	})
	return granted, err
}

// SendTest raises a notification right now, ignoring both the preference and
// the window check.
//
// It exists because "notifications do not work" is not something the user can
// diagnose and not something the logs answer: Windows silently drops toasts
// for all sorts of reasons -- Focus Assist, an unregistered app id, a
// notifications-off system setting. This turns that into an error the user can
// read, or a toast they can see.
func (s *Service) SendTest() error {
	if !s.Supported() {
		return fmt.Errorf("notifications are not available on this platform")
	}
	return s.onOwnThread(func() error {
		return s.backend.Send("Vantare", "Las notificaciones de escritorio funcionan.")
	})
}

// LaunchFinished raises the toast for a finished launch chain. It returns
// whether one was sent, which is what lets a caller tell the difference between
// "declined" and "failed".
func (s *Service) LaunchFinished(profileName string, ok bool) (bool, error) {
	if !s.Supported() {
		return false, nil
	}
	if s.enabled == nil || !s.enabled() {
		return false, nil
	}
	// Checked before the window test so that a revoked permission is reported
	// even when the user happens to be looking at the app.
	authorized, err := s.Authorized()
	if err != nil {
		return false, err
	}
	if !authorized {
		return false, nil
	}
	if s.hidden == nil || !s.hidden() {
		return false, nil
	}
	body := fmt.Sprintf("El perfil %s está listo.", profileName)
	if !ok {
		body = fmt.Sprintf("El perfil %s no se pudo iniciar del todo.", profileName)
	}
	if err := s.onOwnThread(func() error { return s.backend.Send("Vantare", body) }); err != nil {
		return false, err
	}
	return true, nil
}
