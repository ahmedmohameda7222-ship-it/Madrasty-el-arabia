-- Self-service profile: retain institutional ownership of identities and enrollment.
alter table app.student add column birth_date date check (birth_date >= date '1900-01-01');
alter table app.guardian_profile add column birth_date date check (birth_date >= date '1900-01-01'),
  add column emergency_address text check (char_length(emergency_address) between 1 and 500);
create function app.self_profile() returns jsonb
language sql stable security definer set search_path=pg_catalog
as $$
  select case when app.actor_persona()='guardian' then
    (select jsonb_build_object('displayName',g.display_name,
      'guardian',jsonb_build_object('revision',g.revision,'birthDate',g.birth_date,'phone',g.contact_phone,'emergencyAddress',g.emergency_address),
      'children',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'displayName',s.display_name,'birthDate',s.birth_date,
        'age',extract(year from age(current_date,s.birth_date))::int,'revision',s.revision) order by s.display_name,s.id)
        from app.student s where s.state='active' and app.has_child_link(s.id)),'[]'::jsonb))
      from app.guardian_profile g where g.account_id=app.actor_account())
  else jsonb_build_object('displayName',(select p.display_name from app.staff_profile p where p.account_id=app.actor_account()
      and p.disabled_at is null order by p.active_from desc limit 1),
      'guardian',null,'children','[]'::jsonb) end
  where app.guard_actor()
$$;
create function app.update_self_profile(kind text, child uuid, expected integer, birthday date, name text, phone text, address text) returns integer
language plpgsql security definer set search_path=pg_catalog
as $$
declare next_revision integer;
begin
  if app.guard_actor() is not true or app.actor_persona() is distinct from 'guardian'::app.persona then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if birthday is not null and (birthday < date '1900-01-01' or birthday > current_date) then
    raise exception 'Invalid date' using errcode='23514';
  end if;
  if kind='guardian' then
    update app.guardian_profile g set birth_date=birthday,contact_phone=phone,emergency_address=address,revision=g.revision+1
    where g.account_id=app.actor_account() and g.revision=expected returning g.revision into next_revision;
  elsif kind='child' then
    -- Lock the approved relationship to serialize a concurrent revocation.
    perform 1 from app.child_link l join app.guardian_profile g on g.id=l.guardian_id
      where g.account_id=app.actor_account() and l.student_id=child and l.state='approved'
      and l.effective_from<=now() and (l.effective_until is null or l.effective_until>now())
      for update of l;
    if not found then raise exception 'Child access denied' using errcode='42501'; end if;
    update app.student s set birth_date=birthday,display_name=name,revision=s.revision+1
      where s.id=child and s.state='active' and s.revision=expected returning s.revision into next_revision;
  else raise exception 'Invalid profile section' using errcode='23514';
  end if;
  return next_revision;
end
$$;
revoke all on function app.self_profile(),app.update_self_profile(text,uuid,integer,date,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function app.self_profile(),app.update_self_profile(text,uuid,integer,date,text,text,text) to app_runtime;
