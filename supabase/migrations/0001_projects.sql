-- Projects, and the canvas blocks (artefacts + stickies) and connections inside each one.
--
-- Ownership: every row in `projects` has an `owner_id` that defaults to auth.uid().
-- Until authentication ships, requests come in as the anonymous role, so auth.uid() is null
-- and projects are created with a null owner. The policies below compare owner_id to auth.uid()
-- with IS NOT DISTINCT FROM, so:
--   * anonymous requests only see projects with no owner (today's behaviour), and
--   * signed-in users will only see their own projects, with no policy change needed.
-- When auth ships, claim the existing ownerless projects with:
--   update public.projects set owner_id = '<user uuid>' where owner_id is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(trim(name)) > 0),
  figjam_file_key text not null,
  figjam_file_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Each FigJam file belongs to exactly one of a user's projects
  constraint projects_owner_figjam_unique unique nulls not distinct (owner_id, figjam_file_key)
);

create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

-- One row per canvas block. `data` holds the full block (title, text, generated output, links, ...);
-- type and position are split out so they can be queried without unpacking the JSON.
create table public.project_nodes (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  type text not null,
  position_x double precision not null,
  position_y double precision not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (project_id, id)
);

create table public.project_edges (
  project_id uuid not null references public.projects (id) on delete cascade,
  id text not null,
  from_node text not null,
  to_node text not null,
  primary key (project_id, id),
  foreign key (project_id, from_node) references public.project_nodes (project_id, id) on delete cascade,
  foreign key (project_id, to_node) references public.project_nodes (project_id, id) on delete cascade
);

-- Keep projects.updated_at current, including when only the canvas changes,
-- so the project list can sort by "last edited".
create function public.touch_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'projects' then
    new.updated_at := now();
    return new;
  end if;
  update public.projects set updated_at = now()
  where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_project();
create trigger project_nodes_touch after insert or update or delete on public.project_nodes
  for each row execute function public.touch_project();
create trigger project_edges_touch after insert or update or delete on public.project_edges
  for each row execute function public.touch_project();

-- Row level security
alter table public.projects enable row level security;
alter table public.project_nodes enable row level security;
alter table public.project_edges enable row level security;

create policy "Owners manage their projects" on public.projects
  for all to anon, authenticated
  using (owner_id is not distinct from auth.uid())
  with check (owner_id is not distinct from auth.uid());

create policy "Owners manage their project nodes" on public.project_nodes
  for all to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id is not distinct from auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id is not distinct from auth.uid()));

create policy "Owners manage their project edges" on public.project_edges
  for all to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id is not distinct from auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id is not distinct from auth.uid()));

grant select, insert, update, delete on public.projects, public.project_nodes, public.project_edges to anon, authenticated;
