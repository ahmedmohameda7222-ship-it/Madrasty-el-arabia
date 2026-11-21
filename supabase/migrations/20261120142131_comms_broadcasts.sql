create function app.valid_broadcast_copy(value jsonb) returns boolean
language sql immutable set search_path=pg_catalog
as $$
  select coalesce(jsonb_typeof(value)='object'
    and jsonb_typeof(value->'ar'->'title')='string' and jsonb_typeof(value->'ar'->'body')='string'
    and jsonb_typeof(value->'de'->'title')='string' and jsonb_typeof(value->'de'->'body')='string'
    and char_length(btrim(value->'ar'->>'title')) between 1 and 180
    and char_length(btrim(value->'de'->>'title')) between 1 and 180
    and char_length(btrim(value->'ar'->>'body')) between 1 and 4000
    and char_length(btrim(value->'de'->>'body')) between 1 and 4000,false)
$$;

create table app.broadcast_preview (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references app.account,
  persona app.persona not null check(persona in ('admin','teacher')),
  audience_kind text not null check(audience_kind in ('all_guardians','class_guardians','all_teachers')),
  class_id uuid references app.school_class,
  copy jsonb not null check(app.valid_broadcast_copy(copy)),
  fingerprint bytea not null check(octet_length(fingerprint)=32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check ((audience_kind='class_guardians') = (class_id is not null))
);
create index broadcast_preview_expiry_idx on app.broadcast_preview(expires_at,id);

create table app.broadcast_publication (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid not null unique references app.broadcast_preview,
  publisher_id uuid not null references app.account,
  publisher_persona app.persona not null check(publisher_persona in ('admin','teacher')),
  audience_kind text not null check(audience_kind in ('all_guardians','class_guardians','all_teachers')),
  class_id uuid references app.school_class,
  copy jsonb not null check(app.valid_broadcast_copy(copy)),
  reviewed_count integer not null check(reviewed_count>0),
  published_at timestamptz not null default now(),
  check ((audience_kind='class_guardians') = (class_id is not null))
);
create index broadcast_sent_idx on app.broadcast_publication(publisher_id,publisher_persona,published_at desc,id desc);

create table app.broadcast_recipient (
  publication_id uuid not null references app.broadcast_publication,
  account_id uuid not null references app.account,
  locale_at_publish text not null check(locale_at_publish in ('ar','de')),
  dispatch_state text not null default 'pending' check(dispatch_state in ('pending','queued','suppressed')),
  primary key (publication_id,account_id)
);
create index broadcast_received_idx on app.broadcast_recipient(account_id,publication_id);
alter table app.broadcast_preview enable row level security;
alter table app.broadcast_publication enable row level security;
alter table app.broadcast_recipient enable row level security;

create function app.broadcast_classes()
returns table(id uuid,name_ar text,name_de text,code text)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.id,c.name_ar,c.name_de,c.code
  from app.school_class c join app.school_year y on y.id=c.year_id
  cross join lateral (select app.school_today() as day) t
  where y.state='active' and t.day>=y.starts_on and t.day<y.ends_exclusive
    and (app.has_capability('comms.publish') or app.teacher_scope(c.id,t.day,'comms.class'))
$$;

create function app.broadcast_sender_allowed(kind text,target_class uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select case
    when kind='class_guardians' then exists(select 1 from app.broadcast_classes() c where c.id=target_class)
    when kind in ('all_guardians','all_teachers') and target_class is null then app.has_capability('comms.publish')
    else false end
$$;

-- Only internal definer functions and the scoped outbox consumer may request addressed account IDs.
create function app.broadcast_cohort(kind text,target_class uuid,only_account uuid default null)
returns table(account_id uuid,locale text)
language sql stable security definer set search_path=pg_catalog
as $$
  with school_day as (select app.school_today() as day)
  select g.account_id,coalesce(p.correspondence_locale,g.correspondence_locale)
  from app.guardian_profile g
  left join app.account_preference p on p.account_id=g.account_id
  where kind in ('all_guardians','class_guardians') and (only_account is null or g.account_id=only_account)
    and g.account_id is not null and app.contact_account_active(g.account_id,'guardian')
    and exists (
      select 1 from app.child_link l join app.student s on s.id=l.student_id and s.state='active'
      where l.guardian_id=g.id and l.state='approved' and l.effective_from<=now()
        and (l.effective_until is null or l.effective_until>now())
        and (kind='all_guardians' or exists(
          select 1 from app.enrollment e join app.school_year y on y.id=e.year_id and y.state='active',school_day t
          where e.student_id=s.id and e.class_id=target_class and e.voided_at is null
            and t.day>=e.effective_from and t.day<e.effective_until
        ))
    )
  union all
  select a.id,coalesce(p.correspondence_locale,i.correspondence_locale,e.correspondence_locale,'ar')
  from app.account a
  left join app.account_preference p on p.account_id=a.id
  left join app.teacher_invite_contact i on i.account_id=a.id
  left join app.teacher_application e on e.applicant_id=a.id
  where kind='all_teachers' and (only_account is null or a.id=only_account) and app.contact_account_active(a.id,'teacher')
$$;

create function app.broadcast_fingerprint(kind text,target_class uuid,copies jsonb,cohort jsonb)
returns bytea language sql immutable set search_path=pg_catalog
as $$
  select sha256(convert_to(jsonb_build_array(kind,target_class,copies,cohort)::text,'UTF8'))
$$;

create function app.preview_school_broadcast(kind text,target_class uuid,copies jsonb)
returns table(preview_id uuid,expires_at timestamptz,ar_count integer,de_count integer)
language plpgsql security definer set search_path=pg_catalog
as $$
declare cohort jsonb;
declare saved record;
begin
  if not app.broadcast_sender_allowed(kind,target_class) then
    raise exception 'Broadcast audience unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.account_id,'locale',c.locale) order by c.account_id),'[]'::jsonb),
    count(*) filter(where c.locale='ar')::integer,count(*) filter(where c.locale='de')::integer
  into cohort,ar_count,de_count from app.broadcast_cohort(kind,target_class) c;
  insert into app.broadcast_preview as p(account_id,persona,audience_kind,class_id,copy,fingerprint,expires_at)
  values(app.actor_account(),app.actor_persona(),kind,target_class,copies,
    app.broadcast_fingerprint(kind,target_class,copies,cohort),now()+interval '15 minutes')
  returning p.id,p.expires_at into saved;
  preview_id:=saved.id;
  expires_at:=saved.expires_at;
  return next;
end
$$;

create function app.can_publish_broadcast_preview(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
  select exists(select 1 from app.broadcast_preview p where p.id=target
    and p.account_id=app.actor_account() and p.persona=app.actor_persona()
    and app.broadcast_sender_allowed(p.audience_kind,p.class_id))
$$;

create function app.publish_school_broadcast(target uuid)
returns table(publication_id uuid,reviewed_count integer,inserted boolean)
language plpgsql security definer set search_path=pg_catalog
as $$
declare review record;
declare saved record;
declare cohort jsonb;
begin
  select p.* into review from app.broadcast_preview p where p.id=target
    and p.account_id=app.actor_account() and p.persona=app.actor_persona() for update;
  if not found or not app.broadcast_sender_allowed(review.audience_kind,review.class_id) then
    raise exception 'Broadcast preview unavailable' using errcode='42501';
  end if;
  select p.id,p.reviewed_count into saved from app.broadcast_publication p where p.preview_id=target;
  if found then return query select saved.id,saved.reviewed_count,false; return; end if;
  if review.expires_at<=now() then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.account_id,'locale',c.locale) order by c.account_id),'[]'::jsonb)
  into cohort from app.broadcast_cohort(review.audience_kind,review.class_id) c
  where app.broadcast_sender_allowed(review.audience_kind,review.class_id);
  if jsonb_array_length(cohort)=0 or
    app.broadcast_fingerprint(review.audience_kind,review.class_id,review.copy,cohort) is distinct from review.fingerprint
  then return; end if;
  insert into app.broadcast_publication as b(preview_id,publisher_id,publisher_persona,audience_kind,class_id,copy,reviewed_count)
  values(target,review.account_id,review.persona,review.audience_kind,review.class_id,review.copy,jsonb_array_length(cohort))
  returning b.id,b.reviewed_count into saved;
  insert into app.broadcast_recipient(publication_id,account_id,locale_at_publish)
  select saved.id,c.id,c.locale from jsonb_to_recordset(cohort) as c(id uuid,locale text);
  return query select saved.id,saved.reviewed_count,true;
end
$$;

create function app.broadcast_recipient_locale(target uuid,recipient uuid) returns text
language sql stable security definer set search_path=pg_catalog
as $$
  select c.locale from app.broadcast_publication b
  join app.broadcast_recipient r on r.publication_id=b.id and r.account_id=recipient
  cross join lateral app.broadcast_cohort(b.audience_kind,b.class_id,r.account_id) c
  where b.id=target
$$;

create function app.sent_school_broadcasts()
returns table(id uuid,audience_kind text,class_id uuid,class_ar text,class_de text,copy jsonb,published_at timestamptz,
  reviewed_count integer,pending_count integer,queued_count integer,suppressed_count integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select b.id,b.audience_kind,b.class_id,c.name_ar,c.name_de,b.copy,b.published_at,b.reviewed_count,
    counts.pending,counts.queued,counts.suppressed
  from app.broadcast_publication b left join app.school_class c on c.id=b.class_id
  cross join lateral (
    select count(*) filter(where r.dispatch_state='pending')::integer as pending,
      count(*) filter(where r.dispatch_state='queued')::integer as queued,
      count(*) filter(where r.dispatch_state='suppressed')::integer as suppressed
    from app.broadcast_recipient r where r.publication_id=b.id
  ) counts
  where b.publisher_id=app.actor_account() and b.publisher_persona=app.actor_persona()
    and app.broadcast_sender_allowed(b.audience_kind,b.class_id)
$$;

create function app.received_school_broadcasts(target uuid)
returns table(id uuid,published_at timestamptz,copy jsonb)
language sql stable security definer set search_path=pg_catalog
as $$
  select b.id,b.published_at,b.copy
  from app.broadcast_recipient r join app.broadcast_publication b on b.id=r.publication_id
  where r.account_id=app.actor_account() and (target is null or b.id=target)
    and app.actor_persona()::text=(case when b.audience_kind='all_teachers' then 'teacher' else 'guardian' end)
    and app.broadcast_recipient_locale(b.id,r.account_id) is not null
$$;

create function app.expire_school_broadcast_previews(maximum integer)
returns integer language sql security definer set search_path=pg_catalog
as $$
  with expired as (
    select p.id from app.broadcast_preview p
    where p.expires_at<=now() and not exists(select 1 from app.broadcast_publication b where b.preview_id=p.id)
    order by p.expires_at,p.id limit least(greatest(maximum,1),100) for update skip locked
  ), removed as (
    delete from app.broadcast_preview p using expired e where p.id=e.id returning p.id
  ) select count(*)::integer from removed
$$;

insert into app.audit_action_rule(action,resource_kind,change_category,allowed_capabilities,link_kind)
values('comms.broadcast_published','communications','publication',array['comms.publish'],null);

revoke all on function app.valid_broadcast_copy(jsonb),app.broadcast_classes(),app.broadcast_sender_allowed(text,uuid),
  app.broadcast_cohort(text,uuid,uuid),app.broadcast_fingerprint(text,uuid,jsonb,jsonb),app.preview_school_broadcast(text,uuid,jsonb),
  app.can_publish_broadcast_preview(uuid),app.publish_school_broadcast(uuid),app.broadcast_recipient_locale(uuid,uuid),
  app.sent_school_broadcasts(),app.received_school_broadcasts(uuid),app.expire_school_broadcast_previews(integer)
from public,anon,authenticated,service_role;
grant execute on function app.broadcast_classes(),app.broadcast_sender_allowed(text,uuid),app.preview_school_broadcast(text,uuid,jsonb),
  app.can_publish_broadcast_preview(uuid),app.publish_school_broadcast(uuid),app.sent_school_broadcasts(),
  app.received_school_broadcasts(uuid),app.expire_school_broadcast_previews(integer)
to app_runtime;
