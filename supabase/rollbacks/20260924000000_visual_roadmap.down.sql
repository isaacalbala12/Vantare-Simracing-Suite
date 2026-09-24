drop function if exists public.visual_roadmap_my_draft();
drop function if exists public.visual_roadmap_current();
drop function if exists public.visual_roadmap_publish(uuid);
drop function if exists public.visual_roadmap_draft_save(jsonb);
drop function if exists public.visual_roadmap_valid(jsonb);
drop table if exists public.visual_roadmap;
