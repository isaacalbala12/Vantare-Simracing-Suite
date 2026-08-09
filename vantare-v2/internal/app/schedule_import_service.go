package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/vantare/overlays/v2/internal/calendar"
)

// ScheduleImportService backs the owner-only schedule import screen.
//
// The parse runs locally so the owner sees what the app understood before
// anything is stored, and the authority to store it lives in the database. This
// service only carries messages between the two.
type ScheduleImportService struct {
	publisher *calendar.SchedulePublisher
	emitter   EventEmitter
}

// NewScheduleImportService wires the import screen to a publisher. A nil
// publisher means Supabase is not configured, which the screen reports rather
// than pretending the feature works.
func NewScheduleImportService(publisher *calendar.SchedulePublisher, emitter EventEmitter) *ScheduleImportService {
	return &ScheduleImportService{publisher: publisher, emitter: emitter}
}

// SchedulePreview is what the owner reviews before publishing: enough of the
// parse to tell at a glance whether the parser understood the text.
type SchedulePreview struct {
	ValidFrom   string          `json:"validFrom"`
	ValidUntil  string          `json:"validUntil"`
	SeriesCount int             `json:"seriesCount"`
	Series      []PreviewSeries `json:"series"`
}

// PreviewSeries is one row of the review table.
type PreviewSeries struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Tier         string   `json:"tier"`
	Track        string   `json:"track"`
	Classes      []string `json:"classes"`
	RaceMin      int      `json:"raceMin"`
	Cadence      string   `json:"cadence"`
	Setup        string   `json:"setup"`
	TimeScale    int      `json:"timeScale,omitempty"`
	VELimit      int      `json:"veLimit,omitempty"`
	SafetyRating string   `json:"safetyRating,omitempty"`
	NoteCount    int      `json:"noteCount"`
}

// Parse turns pasted text into a preview without touching the network, and
// emits either schedule:preview or schedule:error.
func (s *ScheduleImportService) Parse(text string) {
	sched, err := calendar.ParseAndValidate(text)
	if err != nil {
		s.emitError(err)
		return
	}
	s.emitter.Emit("schedule:preview", buildSchedulePreview(sched))
}

// SaveDraft parses and stores the text as the owner's draft.
func (s *ScheduleImportService) SaveDraft(ctx context.Context, sessionToken, text string) {
	if s.publisher == nil {
		s.emitError(errors.New("Supabase no está configurado en esta build"))
		return
	}
	id, err := s.publisher.SaveDraft(ctx, sessionToken, text)
	if err != nil {
		s.emitError(err)
		return
	}
	s.emitter.Emit("schedule:draft-saved", map[string]any{"draftId": id})
}

// Publish promotes the draft so every client picks it up.
func (s *ScheduleImportService) Publish(ctx context.Context, sessionToken, draftID string) {
	if s.publisher == nil {
		s.emitError(errors.New("Supabase no está configurado en esta build"))
		return
	}
	if draftID == "" {
		s.emitError(errors.New("no hay borrador que publicar"))
		return
	}
	if err := s.publisher.Publish(ctx, sessionToken, draftID); err != nil {
		s.emitError(err)
		return
	}
	s.emitter.Emit("schedule:published", map[string]any{"draftId": draftID})
}

// LoadDraft returns the owner's pending draft so the screen can resume a review
// that was interrupted.
func (s *ScheduleImportService) LoadDraft(ctx context.Context, sessionToken string) {
	if s.publisher == nil {
		s.emitError(errors.New("Supabase no está configurado en esta build"))
		return
	}
	draft, err := s.publisher.MyDraft(ctx, sessionToken)
	if err != nil {
		s.emitError(err)
		return
	}
	if draft == nil {
		s.emitter.Emit("schedule:draft", map[string]any{"draft": nil})
		return
	}
	s.emitter.Emit("schedule:draft", map[string]any{
		"draftId":    draft.ID,
		"sourceText": draft.SourceText,
		"preview":    buildSchedulePreview(draft.Schedule),
	})
}

func (s *ScheduleImportService) emitError(err error) {
	message := err.Error()
	if errors.Is(err, calendar.ErrNotOwner) {
		message = "Necesitas rol owner para importar el horario"
	}
	s.emitter.Emit("schedule:error", map[string]any{"message": message})
}

func buildSchedulePreview(sched calendar.OfficialSchedule) SchedulePreview {
	preview := SchedulePreview{
		ValidFrom:   sched.ValidFrom.Format("2006-01-02"),
		ValidUntil:  sched.ValidUntil.Format("2006-01-02"),
		SeriesCount: len(sched.Series),
		Series:      make([]PreviewSeries, 0, len(sched.Series)),
	}
	for _, s := range sched.Series {
		classes := make([]string, 0, len(s.Classes))
		for _, c := range s.Classes {
			if c.Qualifier != "" {
				classes = append(classes, fmt.Sprintf("%s (%s)", c.Name, c.Qualifier))
				continue
			}
			classes = append(classes, c.Name)
		}
		preview.Series = append(preview.Series, PreviewSeries{
			ID:           s.ID,
			Name:         s.Name,
			Tier:         s.Tier,
			Track:        s.Track,
			Classes:      classes,
			RaceMin:      s.RaceDurationMin,
			Cadence:      cadenceLabel(s),
			Setup:        s.Setup,
			TimeScale:    s.TimeScale,
			VELimit:      s.VELimit,
			SafetyRating: s.SafetyRating,
			NoteCount:    len(s.Notes),
		})
	}
	return preview
}

// cadenceLabel states how often a series runs, in the same words the source
// document uses.
func cadenceLabel(s calendar.RaceSeries) string {
	switch s.Recurrence.Kind {
	case "interval":
		return fmt.Sprintf("cada %dmin", s.Recurrence.IntervalMinutes)
	case "weekly-slots":
		return fmt.Sprintf("%d días × %d horas", len(s.Recurrence.Days), len(s.Recurrence.TimesUTC))
	default:
		return s.Recurrence.Kind
	}
}
