package app_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
	"github.com/vantare/overlays/v2/internal/updater"
)

// installFixture serves a releases list plus the installer and its checksum, so
// an install can be driven end to end without the frontend handing over URLs.
type installFixture struct {
	server       *httptest.Server
	installerHit chan struct{}
	block        chan struct{}
	unblockOnce  sync.Once
	listHits     atomic.Int32
}

// releaseListHits counts how many times the catalogue was requested.
func (f *installFixture) releaseListHits() int {
	return int(f.listHits.Load())
}

// release lets the blocked installer download finish. Safe to call twice: the
// test unblocks it and the cleanup does too.
func (f *installFixture) release() {
	f.unblockOnce.Do(func() { close(f.block) })
}

func newInstallFixture(t *testing.T, tag string, blockInstaller bool) *installFixture {
	t.Helper()
	fixture := &installFixture{
		installerHit: make(chan struct{}, 4),
		block:        make(chan struct{}),
	}
	var base string
	fixture.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/releases"):
			fixture.listHits.Add(1)
			w.Header().Set("Content-Type", "application/json")
			// El canal sale del propio tag, igual que en GitHub: una nightly
			// se publica como prerelease y una estable no.
			prerelease := strings.Contains(tag, "nightly") || strings.Contains(tag, "testers")
			fmt.Fprintf(w, `[{"tag_name":%q,"name":%q,"prerelease":%t,"assets":[
				{"name":"vantare-amd64-installer.exe","browser_download_url":%q},
				{"name":"vantare-amd64-installer.exe.sha256","browser_download_url":%q}
			]}]`, tag, tag, prerelease, base+"/installer.exe", base+"/installer.exe.sha256")
		case strings.HasSuffix(r.URL.Path, "/installer.exe"):
			select {
			case fixture.installerHit <- struct{}{}:
			default:
			}
			if blockInstaller {
				select {
				case <-fixture.block:
				case <-r.Context().Done():
				case <-time.After(10 * time.Second):
				}
			}
			_, _ = w.Write([]byte("no soy un instalador"))
		default:
			// Un checksum que no cuadra: la instalacion se detiene justo antes
			// de ejecutar nada, que es lo que interesa en un test.
			_, _ = w.Write([]byte(strings.Repeat("0", 64) + "  vantare-amd64-installer.exe"))
		}
	}))
	base = fixture.server.URL
	t.Cleanup(func() {
		fixture.release()
		fixture.server.Close()
	})
	return fixture
}

func newInstallService(t *testing.T, fixture *installFixture) *app.UpdaterService {
	t.Helper()
	svc, _ := newInstallServiceAt(t, fixture)
	return svc
}

// newInstallServiceAt also returns the settings path, so a test can build a
// second service that shares the cooldown on disk but not the in-memory cache.
func newInstallServiceAt(t *testing.T, fixture *installFixture) (*app.UpdaterService, string) {
	t.Helper()
	t.Setenv("VANTARE_RELEASES_URL", fixture.server.URL+"/releases")
	settingsPath := filepath.Join(t.TempDir(), "updater-settings.json")
	svc, err := app.NewUpdaterService("v0.1.0.1", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatalf("NewUpdaterService: %v", err)
	}
	return svc, settingsPath
}

func TestInstallResolvesTheReleaseFromTheBackendsOwnList(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	// Llega hasta la verificacion (el checksum del fixture no cuadra), lo que
	// prueba que resolvio el tag y descargo de la URL que publica el servidor.
	err := svc.InstallVerifiedVersionCtx(context.Background(), "v0.1.0.2")
	if err == nil {
		t.Fatal("el fixture sirve un checksum que no cuadra: la instalacion no puede darse por buena")
	}
	if !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("se esperaba fallo de checksum, y fallo antes con: %v", err)
	}
	select {
	case <-fixture.installerHit:
	default:
		t.Fatal("no llego a pedir el instalador al servidor")
	}
}

func TestInstallRefusesATagThatIsNotPublished(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	err := svc.InstallVerifiedVersionCtx(context.Background(), "v9.9.9.9")
	if err == nil {
		t.Fatal("un tag que no existe no puede instalarse")
	}
	if !strings.Contains(err.Error(), "not available") {
		t.Fatalf("error inesperado: %v", err)
	}
	select {
	case <-fixture.installerHit:
		t.Fatal("no debe descargarse nada para un tag que no esta publicado")
	default:
	}
}

func TestInstallRefusesAnEmptyTag(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	if err := svc.InstallVerifiedVersionCtx(context.Background(), "   "); err == nil {
		t.Fatal("un tag vacio no puede instalarse")
	}
}

func TestOnlyOneInstallRunsAtATime(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", true)
	svc := newInstallService(t, fixture)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(1)
	first := make(chan error, 1)
	go func() {
		defer wg.Done()
		first <- svc.InstallVerifiedVersionCtx(ctx, "v0.1.0.2")
	}()

	// Esperar a que la primera este descargando de verdad.
	select {
	case <-fixture.installerHit:
	case <-time.After(10 * time.Second):
		t.Fatal("la primera instalacion no llego a descargar")
	}

	err := svc.InstallVerifiedVersionCtx(ctx, "v0.1.0.2")
	if err == nil {
		t.Fatal("dos instalaciones a la vez escriben el mismo fichero: la segunda debe rechazarse")
	}
	if !strings.Contains(err.Error(), "already in progress") {
		t.Fatalf("error inesperado en la segunda instalacion: %v", err)
	}

	fixture.release()
	wg.Wait()
	<-first
}

func TestASecondInstallIsAllowedOnceTheFirstFinishes(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	for attempt := 0; attempt < 2; attempt++ {
		err := svc.InstallVerifiedVersionCtx(context.Background(), "v0.1.0.2")
		if err == nil {
			t.Fatal("el fixture no puede dar una instalacion por buena")
		}
		if strings.Contains(err.Error(), "already in progress") {
			t.Fatalf("intento %d bloqueado: el cerrojo no se solto al terminar el anterior", attempt+1)
		}
	}
}

func TestInstallRefusesAReleaseWhoseChannelStoppedBeingAllowed(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2-nightly.1", false)
	svc := newInstallService(t, fixture)

	// Con Nightly autorizado, la comprobacion deja la release en cache.
	svc.SetChannelAuthorizer(func(channel updater.Channel) bool { return true })
	if err := svc.SaveSettings(&updater.Settings{Channel: updater.ChannelNightly}); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}
	if _, err := svc.CheckUpdatesManual(); err != nil {
		t.Fatalf("CheckUpdatesManual: %v", err)
	}

	// La licencia se estrecha: lo que ya estaba en cache no puede colarse.
	svc.SetChannelAuthorizer(func(channel updater.Channel) bool {
		return channel == updater.ChannelStable
	})

	err := svc.InstallVerifiedVersionCtx(context.Background(), "v0.1.0.2-nightly.1")
	if err == nil {
		t.Fatal("una release de un canal que ya no esta autorizado no puede instalarse")
	}
	if !strings.Contains(err.Error(), "not authorized") {
		t.Fatalf("se esperaba el rechazo por canal, y fallo con: %v", err)
	}
}

func TestInstallUsesTheListFromTheLastCheckInsteadOfFetchingAgain(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	if _, err := svc.CheckUpdatesManual(); err != nil {
		t.Fatalf("CheckUpdatesManual: %v", err)
	}
	before := fixture.releaseListHits()

	if err := svc.InstallVerifiedVersionCtx(context.Background(), "v0.1.0.2"); err == nil {
		t.Fatal("el fixture no puede dar la instalacion por buena")
	}
	if after := fixture.releaseListHits(); after != before {
		t.Fatalf(
			"instalar volvio a pedir el catalogo entero (%d -> %d): en una linea lenta eso muere antes de bajar un solo byte del instalador",
			before, after,
		)
	}
}

func TestAThrottledCheckAnswersWithWhatIsKnown(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	first, err := svc.CheckUpdatesManual()
	if err != nil {
		t.Fatalf("CheckUpdatesManual: %v", err)
	}
	if !first.HasUpdate || len(first.Releases) != 1 {
		t.Fatalf("la primera comprobacion no vio la release: %+v", first)
	}
	hits := fixture.releaseListHits()

	// Dentro del enfriamiento: no debe volver a preguntar, ni contestar que no
	// hay nada solo porque no ha mirado.
	second, err := svc.CheckUpdates()
	if err != nil {
		t.Fatalf("CheckUpdates: %v", err)
	}
	if fixture.releaseListHits() != hits {
		t.Fatal("una comprobacion estrangulada no puede salir a la red")
	}
	if !second.Throttled {
		t.Fatal("la respuesta debe seguir declarando que no se ha mirado")
	}
	if !second.HasUpdate || len(second.Releases) != 1 {
		t.Fatalf("el enfriamiento borro lo que ya se sabia: %+v", second)
	}
}

func TestAForcedCheckIgnoresTheCooldown(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc := newInstallService(t, fixture)

	if _, err := svc.CheckUpdatesManual(); err != nil {
		t.Fatalf("primera: %v", err)
	}
	hits := fixture.releaseListHits()
	if _, err := svc.CheckUpdatesManual(); err != nil {
		t.Fatalf("segunda: %v", err)
	}
	if fixture.releaseListHits() <= hits {
		t.Fatal("el boton de comprobar tiene que preguntar de verdad")
	}
}

func TestAThrottledCheckWithNothingKnownStillSaysSo(t *testing.T) {
	fixture := newInstallFixture(t, "v0.1.0.2", false)
	svc, settingsPath := newInstallServiceAt(t, fixture)

	if _, err := svc.CheckUpdatesManual(); err != nil {
		t.Fatalf("CheckUpdatesManual: %v", err)
	}
	// Un servicio nuevo sobre los mismos ajustes: hereda el enfriamiento del
	// disco, pero no la cache en memoria.
	fresh, err := app.NewUpdaterService("v0.1.0.1", settingsPath, &spyEmitter{})
	if err != nil {
		t.Fatalf("NewUpdaterService: %v", err)
	}
	info, err := fresh.CheckUpdates()
	if err != nil {
		t.Fatalf("CheckUpdates: %v", err)
	}
	if !info.Throttled {
		t.Fatal("se esperaba una respuesta estrangulada")
	}
	if info.HasUpdate {
		t.Fatal("sin nada en cache no se puede afirmar que haya actualizacion")
	}
}
