package main

import "github.com/vantare/overlays/v2/internal/app"

// wireWidgetPolicySources connects the native widget-policy authority to
// every profile save path (ISA-1097): HubService.SaveProfile, ProfileService
// SaveProfile/SaveProfileState and StudioProfileService saves. Each service
// compares the incoming document against its native baseline and denies
// privilege-escalating edits on blocked widgets while preserving moves,
// deletions and imports. Nil services are skipped; a nil source keeps the
// legacy behavior (no gate) and is only for tests.
func wireWidgetPolicySources(hubSvc *app.HubService, profileSvc *app.ProfileService, studioSvc *app.StudioProfileService, src app.WidgetPolicySource) {
	if hubSvc != nil {
		hubSvc.SetWidgetPolicySource(src)
	}
	if profileSvc != nil {
		profileSvc.SetWidgetPolicySource(src)
	}
	if studioSvc != nil {
		studioSvc.SetWidgetPolicySource(src)
	}
}
