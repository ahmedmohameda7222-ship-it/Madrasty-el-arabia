create function app.valid_collection_iban(value text) returns boolean
language plpgsql immutable set search_path=pg_catalog
as $$
declare rotated text;
declare symbol text;
declare remainder integer:=0;
begin
  if value is null or value !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then return false; end if;
  rotated:=substr(value,5)||substr(value,1,4);
  for position in 1..length(rotated) loop
    symbol:=substr(rotated,position,1);
    remainder:=case when symbol between '0' and '9' then (remainder*10+ascii(symbol)-48)%97
      else (remainder*100+ascii(symbol)-55)%97 end;
  end loop;
  return remainder=1;
end
$$;

create table app.collection_bank_version (
  id uuid primary key default gen_random_uuid(),
  beneficiary text not null check(char_length(beneficiary) between 1 and 140 and beneficiary=btrim(beneficiary)),
  iban text not null check(app.valid_collection_iban(iban)),
  started_at timestamptz not null default now(),
  recorded_by uuid not null references app.account,
  recorded_session uuid not null references app.session_binding
);
create table app.collection_bank_setting (
  singleton boolean primary key default true check(singleton),
  bank_id uuid references app.collection_bank_version,
  revision integer not null default 0 check(revision>=0),
  check((bank_id is null)=(revision=0))
);
insert into app.collection_bank_setting(singleton) values(true);

create table app.bank_change_challenge (
  challenge_id uuid primary key,
  account_id uuid not null references app.account,
  session_id uuid not null references app.session_binding,
  factor_id uuid not null,
  purpose text not null default 'bank.configure' check(purpose='bank.configure'),
  proposal_hash text not null check(proposal_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  verification_started_at timestamptz,
  proof_hash text unique check(proof_hash ~ '^[a-f0-9]{64}$'),
  proof_until timestamptz,
  used_at timestamptz,
  check((proof_hash is null)=(proof_until is null))
);
create index bank_change_challenge_expiry_idx on app.bank_change_challenge(expires_at);

create table app.student_transfer_reference (
  student_id uuid primary key references app.student,
  reference text not null unique check(char_length(reference) between 4 and 140),
  created_at timestamptz not null default now()
);
alter table app.collection_bank_version enable row level security;
alter table app.collection_bank_setting enable row level security;
alter table app.bank_change_challenge enable row level security;
alter table app.student_transfer_reference enable row level security;

create function app.collection_bank_settings()
returns table(revision integer,version_id uuid,beneficiary text,iban text,effective_at timestamptz)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.revision,b.id,b.beneficiary,b.iban,b.started_at
  from app.collection_bank_setting c left join app.collection_bank_version b on b.id=c.bank_id
  where c.singleton and app.has_capability('bank.configure')
$$;

create function app.collection_bank_for_issue()
returns table(version_id uuid,beneficiary text,iban text,effective_at timestamptz,currency text)
language sql stable security definer set search_path=pg_catalog
as $$
  select b.id,b.beneficiary,b.iban,b.started_at,s.currency::text
  from app.collection_bank_setting c join app.collection_bank_version b on b.id=c.bank_id
  join app.school_settings s on s.singleton
  where c.singleton and app.has_capability('finance.issue')
$$;

create function app.record_bank_change_challenge(challenge uuid,factor uuid,fingerprint text,ends_at timestamptz)
returns timestamptz language plpgsql security definer set search_path=pg_catalog
as $$
declare expires timestamptz:=least(ends_at,now()+interval '5 minutes');
begin
  if not app.has_capability('bank.configure') then raise exception 'Bank configuration unavailable' using errcode='42501'; end if;
  if expires<=now() then return null; end if;
  delete from app.bank_change_challenge c where c.session_id=app.actor_session() and c.expires_at<=now();
  insert into app.bank_change_challenge(challenge_id,account_id,session_id,factor_id,proposal_hash,expires_at)
  values(challenge,app.actor_account(),app.actor_session(),factor,fingerprint,expires);
  return expires;
end
$$;

create function app.claim_bank_change_challenge(challenge uuid)
returns uuid language sql security definer set search_path=pg_catalog
as $$
  update app.bank_change_challenge c set verification_started_at=now()
  where app.has_capability('bank.configure') and c.challenge_id=challenge and c.account_id=app.actor_account()
    and c.session_id=app.actor_session() and c.purpose='bank.configure' and c.verification_started_at is null
    and c.expires_at>now() returning c.factor_id
$$;

create function app.complete_bank_change_challenge(challenge uuid,digest text)
returns timestamptz language sql security definer set search_path=pg_catalog
as $$
  update app.bank_change_challenge c set proof_hash=digest,proof_until=least(c.expires_at,now()+interval '2 minutes')
  where app.has_capability('bank.configure') and c.challenge_id=challenge and c.account_id=app.actor_account()
    and c.session_id=app.actor_session() and c.purpose='bank.configure' and c.verification_started_at is not null
    and c.proof_hash is null and c.expires_at>now() returning c.proof_until
$$;

create function app.change_collection_bank(holder text,number text,expected integer,fingerprint text,digest text)
returns table(version_id uuid,old_version_id uuid,effective_at timestamptz,revision integer,masked_iban text)
language plpgsql security definer set search_path=pg_catalog
as $$
declare prior record;
declare saved record;
begin
  if not app.has_capability('bank.configure') then raise exception 'Bank configuration unavailable' using errcode='42501'; end if;
  select c.bank_id,c.revision into prior from app.collection_bank_setting c where c.singleton for update;
  if not found or prior.revision<>expected then return; end if;

  update app.bank_change_challenge c set used_at=now()
  where c.proof_hash=digest and c.proposal_hash=fingerprint and c.account_id=app.actor_account() and c.session_id=app.actor_session()
    and c.purpose='bank.configure' and c.used_at is null and c.proof_until>now();
  if not found then raise exception 'Bank authorization unavailable' using errcode='42501'; end if;

  insert into app.collection_bank_version as b(beneficiary,iban,recorded_by,recorded_session)
  values(holder,number,app.actor_account(),app.actor_session()) returning b.id,b.started_at into saved;
  update app.collection_bank_setting c set bank_id=saved.id,revision=prior.revision+1 where c.singleton;
  return query select saved.id,prior.bank_id,saved.started_at,prior.revision+1,left(number,2)||' •••• '||right(number,4);
end
$$;

create function app.format_student_transfer_reference(display text,student_number text)
returns text language sql immutable set search_path=pg_catalog
as $$
  select concat_ws(' ',nullif(btrim(left(regexp_replace(regexp_replace(
    translate(normalize(display,NFKC),U&'\061c\200e\200f\202a\202b\202c\202d\202e\2066\2067\2068\2069\feff',''),
    '[[:cntrl:]]',' ','g'),'[[:space:]]+',' ','g'),110)),''),student_number)
$$;

create function app.proposed_transfer_reference(pupil uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(r.reference,app.format_student_transfer_reference(s.display_name,s.student_number))
  from app.student s left join app.student_transfer_reference r on r.student_id=s.id
  where s.id=pupil and app.has_capability('finance.issue')
$$;

create function app.transfer_reference(pupil uuid)
returns text language plpgsql security definer set search_path=pg_catalog
as $$
declare value text;
begin
  if not app.has_capability('finance.issue') then raise exception 'Transfer reference unavailable' using errcode='42501'; end if;
  insert into app.student_transfer_reference as r(student_id,reference)
    select s.id,app.format_student_transfer_reference(s.display_name,s.student_number) from app.student s where s.id=pupil
    on conflict(student_id) do nothing returning r.reference into value;
  if found then return value; end if;
  return (select r.reference from app.student_transfer_reference r where r.student_id=pupil);
end
$$;

revoke all on function app.valid_collection_iban(text),app.collection_bank_settings(),app.collection_bank_for_issue(),
  app.record_bank_change_challenge(uuid,uuid,text,timestamptz),app.claim_bank_change_challenge(uuid),app.complete_bank_change_challenge(uuid,text),
  app.change_collection_bank(text,text,integer,text,text),app.format_student_transfer_reference(text,text),
  app.proposed_transfer_reference(uuid),app.transfer_reference(uuid)
from public,anon,authenticated,service_role;
grant execute on function app.collection_bank_settings(),app.collection_bank_for_issue(),
  app.record_bank_change_challenge(uuid,uuid,text,timestamptz),app.claim_bank_change_challenge(uuid),app.complete_bank_change_challenge(uuid,text),
  app.change_collection_bank(text,text,integer,text,text),app.proposed_transfer_reference(uuid),app.transfer_reference(uuid)
to app_runtime;
