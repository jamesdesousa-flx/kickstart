-- Sign-in ships: only @fluxon.com Google accounts may use the app.
--
-- Three layers, so the rule holds even if the browser check is bypassed:
--   1. A trigger on auth.users refuses to create an account for any other email domain.
--   2. Row level security only lets signed-in @fluxon.com users reach their own projects.
--   3. The anonymous role loses all access to the tables.
--
-- Projects created before sign-in have no owner and are now hidden. To give them to someone:
--   update public.projects set owner_id = (select id from auth.users where email = 'name@fluxon.com')
--   where owner_id is null;

create function public.is_allowed_email(email text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(lower(email) like '%@fluxon.com', false);
$$;

-- 1. Block sign-ups from other domains
create function public.reject_disallowed_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'Only @fluxon.com accounts can sign in.';
  end if;
  return new;
end;
$$;

create trigger reject_disallowed_signup before insert or update of email on auth.users
  for each row execute function public.reject_disallowed_signup();

-- 2. Only signed-in @fluxon.com owners reach their projects
create function public.is_allowed_user() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is not null and public.is_allowed_email(auth.jwt() ->> 'email');
$$;

drop policy "Owners manage their projects" on public.projects;
drop policy "Owners manage their project nodes" on public.project_nodes;
drop policy "Owners manage their project edges" on public.project_edges;

create policy "Owners manage their projects" on public.projects
  for all to authenticated
  using (public.is_allowed_user() and owner_id = auth.uid())
  with check (public.is_allowed_user() and owner_id = auth.uid());

create policy "Owners manage their project nodes" on public.project_nodes
  for all to authenticated
  using (public.is_allowed_user() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (public.is_allowed_user() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "Owners manage their project edges" on public.project_edges
  for all to authenticated
  using (public.is_allowed_user() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (public.is_allowed_user() and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

-- 3. No anonymous access
revoke all on public.projects, public.project_nodes, public.project_edges from anon;
