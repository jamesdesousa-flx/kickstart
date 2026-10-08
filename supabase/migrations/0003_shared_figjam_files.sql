-- Projects may share a FigJam file. Every project still needs one, but two projects can point at the same file.
alter table public.projects drop constraint projects_owner_figjam_unique;
