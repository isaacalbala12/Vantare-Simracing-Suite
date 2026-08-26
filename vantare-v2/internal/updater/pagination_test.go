package updater

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
)

// pagedReleasesServer serves `pages` pages of one release each, linking them
// with the `Link` header exactly as the GitHub API does.
func pagedReleasesServer(t *testing.T, pages int) *httptest.Server {
	t.Helper()
	var base string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page := 1
		if raw := r.URL.Query().Get("page"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				t.Errorf("page invalida %q", raw)
			}
			page = parsed
		}
		if page < pages {
			w.Header().Set(
				"Link",
				fmt.Sprintf(`<%s/releases?page=%d>; rel="next", <%s/releases?page=%d>; rel="last"`,
					base, page+1, base, pages),
			)
		}
		w.Header().Set("Content-Type", "application/json")
		// La primera pagina lleva la mas nueva; las siguientes, mas antiguas.
		fmt.Fprintf(w, `[{"tag_name":"v0.1.0.%d","prerelease":false,"assets":[]}]`, pages-page)
	}))
	base = server.URL
	return server
}

func TestListReleasesWalksEveryPage(t *testing.T) {
	server := pagedReleasesServer(t, 3)
	defer server.Close()

	releases, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases")
	if err != nil {
		t.Fatalf("listReleasesURL: %v", err)
	}
	if len(releases) != 3 {
		t.Fatalf("se quedo con %d releases de 3: las que no caben en la primera pagina dejan de existir", len(releases))
	}
	tags := make([]string, 0, len(releases))
	for _, release := range releases {
		tags = append(tags, release.TagName)
	}
	want := []string{"v0.1.0.2", "v0.1.0.1", "v0.1.0.0"}
	if strings.Join(tags, ",") != strings.Join(want, ",") {
		t.Fatalf("tags=%v, esperados %v", tags, want)
	}
}

func TestListReleasesAsksForTheBiggestPage(t *testing.T) {
	var got string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.URL.Query().Get("per_page")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	if _, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases"); err != nil {
		t.Fatalf("listReleasesURL: %v", err)
	}
	if got != strconv.Itoa(releasesPerPage) {
		t.Fatalf("per_page=%q, esperado %d: con el valor por omision de GitHub (30) caben poco mas de un mes de nightlies", got, releasesPerPage)
	}
}

func TestListReleasesKeepsTheQueryTheOverrideAlreadyHad(t *testing.T) {
	var token string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token = r.URL.Query().Get("token")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	url := server.URL + "/releases?token=abc"
	if _, err := listReleasesURL(context.Background(), server.Client(), url); err != nil {
		t.Fatalf("listReleasesURL: %v", err)
	}
	if token != "abc" {
		t.Fatalf("token=%q: anadir per_page no puede pisar la query que ya traia la URL", token)
	}
}

func TestListReleasesStopsAtThePageBound(t *testing.T) {
	var requests atomic.Int32
	// Un `Link` que siempre apunta a otra pagina: sin tope, el bucle no acaba.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Link", `<`+r.URL.String()+`>; rel="next"`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"tag_name":"v0.1.0.1","prerelease":false,"assets":[]}]`))
	}))
	defer server.Close()

	if _, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases"); err != nil {
		t.Fatalf("listReleasesURL: %v", err)
	}
	if int(requests.Load()) != maxReleasePages {
		t.Fatalf("hizo %d peticiones, esperadas %d", requests.Load(), maxReleasePages)
	}
}

func TestListReleasesStopsOnAnEmptyPage(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.Header().Set("Link", `<`+r.URL.String()+`>; rel="next"`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	if _, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases"); err != nil {
		t.Fatalf("listReleasesURL: %v", err)
	}
	if requests.Load() != 1 {
		t.Fatalf("hizo %d peticiones: una pagina vacia ya es el final", requests.Load())
	}
}

func TestListReleasesFailsWhenAPageAfterTheFirstFails(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) > 1 {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Link", `<`+r.URL.String()+`&page=2>; rel="next"`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"tag_name":"v0.1.0.1","prerelease":false,"assets":[]}]`))
	}))
	defer server.Close()

	// Media lista es peor que ninguna: parecería que la release que falta no
	// existe, y el updater diría que estás al día.
	if _, err := listReleasesURL(context.Background(), server.Client(), server.URL+"/releases"); err == nil {
		t.Fatal("una pagina que falla debe hundir la consulta entera, no devolver media lista")
	}
}

func TestNextPageURLReadsOnlyTheNextRelation(t *testing.T) {
	header := `<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"`
	if got := nextPageURL(header); got != "https://api.github.com/x?page=2" {
		t.Fatalf("next=%q", got)
	}
	if got := nextPageURL(`<https://api.github.com/x?page=9>; rel="last"`); got != "" {
		t.Fatalf("sin rel=next no hay siguiente pagina, y devolvio %q", got)
	}
	if got := nextPageURL(""); got != "" {
		t.Fatalf("cabecera vacia devolvio %q", got)
	}
}

func TestNextPageMustStayOnTheSameHost(t *testing.T) {
	current := "https://api.github.com/repos/x/y/releases?per_page=100"
	if got := resolveNextPage(current, "https://evil.invalid/releases"); got != "" {
		t.Fatalf("siguio a otro host: %q", got)
	}
	if got := resolveNextPage(current, "http://api.github.com/releases"); got != "" {
		t.Fatalf("siguio con otro esquema: %q", got)
	}
	if got := resolveNextPage(current, "/repos/x/y/releases?page=2"); got != "https://api.github.com/repos/x/y/releases?page=2" {
		t.Fatalf("no resolvio un Link relativo: %q", got)
	}
}
