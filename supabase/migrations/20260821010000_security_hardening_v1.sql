-- Security hardening for guest access and privileged catalog functions.
-- Existing invite codes keep working; new rooms receive a 12-character code.

create or replace function public.generate_room_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.reading_rooms where invite_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.generate_room_invite_code() from public;
grant execute on function public.generate_room_invite_code() to authenticated;

create or replace function public.add_reading_room_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reading_room_members (room_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (room_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

revoke all on function public.add_reading_room_owner_membership() from public;

create or replace function public.join_reading_room_by_code(p_invite_code text)
returns setof public.reading_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.reading_rooms%rowtype;
  clean_code text := upper(trim(coalesce(p_invite_code, '')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if length(clean_code) < 6 or length(clean_code) > 16 or clean_code !~ '^[A-Z0-9]+$' then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'P0001';
  end if;

  select room.* into target_room
  from public.reading_rooms room
  where room.invite_code = clean_code;

  if target_room.id is null then
    raise exception 'INVALID_INVITE_CODE' using errcode = 'P0001';
  end if;

  insert into public.reading_room_members (room_id, user_id, role)
  values (
    target_room.id,
    auth.uid(),
    case when target_room.owner_id = auth.uid() then 'owner' else 'member' end
  )
  on conflict (room_id, user_id) do nothing;

  return next target_room;
end;
$$;

revoke all on function public.join_reading_room_by_code(text) from public;
grant execute on function public.join_reading_room_by_code(text) to authenticated;

create or replace function public.save_catalog_book(
  p_title text,
  p_author text default null,
  p_publisher text default null,
  p_published_date text default null,
  p_isbn_10 text default null,
  p_isbn_13 text default null,
  p_cover_url text default null,
  p_source text default 'manual',
  p_external_id text default null
)
returns setof public.books
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_book public.books%rowtype;
  clean_title text := nullif(trim(p_title), '');
  clean_author text := nullif(trim(p_author), '');
  clean_publisher text := nullif(trim(p_publisher), '');
  clean_published_date text := nullif(trim(p_published_date), '');
  clean_isbn_10 text := nullif(upper(regexp_replace(coalesce(p_isbn_10, ''), '[^0-9Xx]', '', 'g')), '');
  clean_isbn_13 text := nullif(regexp_replace(coalesce(p_isbn_13, ''), '[^0-9]', '', 'g'), '');
  clean_cover_url text := nullif(trim(p_cover_url), '');
  clean_source text := coalesce(nullif(trim(p_source), ''), 'manual');
  clean_external_id text := nullif(trim(p_external_id), '');
  may_enrich boolean;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'REGISTERED_USER_REQUIRED' using errcode = 'P0001';
  end if;
  if clean_title is null then
    raise exception 'BOOK_TITLE_REQUIRED' using errcode = 'P0001';
  end if;
  if clean_source = 'manual' and clean_author is null then
    raise exception 'BOOK_AUTHOR_REQUIRED' using errcode = 'P0001';
  end if;
  if clean_source not in ('manual', 'open_library', 'google_books') then
    raise exception 'INVALID_BOOK_SOURCE' using errcode = 'P0001';
  end if;
  if length(clean_title) > 300
    or length(coalesce(clean_author, '')) > 300
    or length(coalesce(clean_publisher, '')) > 300
    or length(coalesce(clean_published_date, '')) > 32
    or length(coalesce(clean_external_id, '')) > 256
    or length(coalesce(clean_cover_url, '')) > 2048 then
    raise exception 'BOOK_METADATA_TOO_LONG' using errcode = 'P0001';
  end if;
  if clean_isbn_10 is not null and length(clean_isbn_10) <> 10 then
    raise exception 'INVALID_ISBN_10' using errcode = 'P0001';
  end if;
  if clean_isbn_13 is not null and length(clean_isbn_13) <> 13 then
    raise exception 'INVALID_ISBN_13' using errcode = 'P0001';
  end if;
  if clean_cover_url is not null and clean_cover_url !~ '^https://' then
    raise exception 'INVALID_COVER_URL' using errcode = 'P0001';
  end if;

  select book.* into saved_book
  from public.books book
  where (clean_external_id is not null and book.source = clean_source and book.external_id = clean_external_id)
     or (clean_isbn_13 is not null and book.isbn_13 = clean_isbn_13)
     or (lower(book.title) = lower(clean_title) and lower(coalesce(book.author, '')) = lower(coalesce(clean_author, '')))
  order by book.id
  limit 1;

  if saved_book.id is not null then
    may_enrich := saved_book.created_by = auth.uid() or exists (
      select 1 from public.reading_rooms room
      where room.book_id = saved_book.id and room.owner_id = auth.uid()
    );
    if may_enrich then
      update public.books set
        author = coalesce(author, clean_author),
        publisher = coalesce(publisher, clean_publisher),
        published_date = coalesce(published_date, clean_published_date),
        isbn_10 = coalesce(isbn_10, clean_isbn_10),
        isbn_13 = coalesce(isbn_13, clean_isbn_13),
        cover_url = coalesce(cover_url, clean_cover_url),
        metadata_status = case when
          coalesce(publisher, clean_publisher) is not null and
          (coalesce(isbn_13, clean_isbn_13) is not null or coalesce(isbn_10, clean_isbn_10) is not null) and
          coalesce(cover_url, clean_cover_url) is not null
          then 'complete' else metadata_status end,
        updated_at = now()
      where id = saved_book.id
      returning * into saved_book;
    end if;
  else
    insert into public.books (
      title, author, publisher, published_date, isbn_10, isbn_13, cover_url,
      source, external_id, metadata_status, created_by
    ) values (
      clean_title, clean_author, clean_publisher, clean_published_date,
      clean_isbn_10, clean_isbn_13, clean_cover_url, clean_source,
      clean_external_id,
      case when clean_publisher is not null
        and (clean_isbn_13 is not null or clean_isbn_10 is not null)
        and clean_cover_url is not null then 'complete' else 'draft' end,
      auth.uid()
    ) returning * into saved_book;
  end if;

  return next saved_book;
end;
$$;

revoke all on function public.save_catalog_book(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.save_catalog_book(text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.update_book_metadata(
  p_book_id bigint,
  p_title text,
  p_author text,
  p_publisher text default null,
  p_published_date text default null,
  p_isbn_10 text default null,
  p_isbn_13 text default null,
  p_cover_url text default null
)
returns setof public.books
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_book public.books%rowtype;
  clean_title text := nullif(trim(p_title), '');
  clean_author text := nullif(trim(p_author), '');
  clean_publisher text := nullif(trim(p_publisher), '');
  clean_published_date text := nullif(trim(p_published_date), '');
  clean_isbn_10 text := nullif(upper(regexp_replace(coalesce(p_isbn_10, ''), '[^0-9Xx]', '', 'g')), '');
  clean_isbn_13 text := nullif(regexp_replace(coalesce(p_isbn_13, ''), '[^0-9]', '', 'g'), '');
  clean_cover_url text := nullif(trim(p_cover_url), '');
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'REGISTERED_USER_REQUIRED' using errcode = 'P0001';
  end if;
  if clean_title is null then
    raise exception 'BOOK_TITLE_REQUIRED' using errcode = 'P0001';
  end if;
  if clean_author is null then
    raise exception 'BOOK_AUTHOR_REQUIRED' using errcode = 'P0001';
  end if;
  if length(clean_title) > 300
    or length(clean_author) > 300
    or length(coalesce(clean_publisher, '')) > 300
    or length(coalesce(clean_published_date, '')) > 32
    or length(coalesce(clean_cover_url, '')) > 2048 then
    raise exception 'BOOK_METADATA_TOO_LONG' using errcode = 'P0001';
  end if;
  if clean_isbn_10 is not null and length(clean_isbn_10) <> 10 then
    raise exception 'INVALID_ISBN_10' using errcode = 'P0001';
  end if;
  if clean_isbn_13 is not null and length(clean_isbn_13) <> 13 then
    raise exception 'INVALID_ISBN_13' using errcode = 'P0001';
  end if;
  if clean_cover_url is not null and clean_cover_url !~ '^https://' then
    raise exception 'INVALID_COVER_URL' using errcode = 'P0001';
  end if;

  select book.* into saved_book
  from public.books book
  where book.id = p_book_id
    and (
      book.created_by = auth.uid()
      or exists (
        select 1 from public.reading_rooms room
        where room.book_id = book.id and room.owner_id = auth.uid()
      )
    );
  if saved_book.id is null then
    raise exception 'BOOK_UPDATE_DENIED' using errcode = 'P0001';
  end if;

  update public.books set
    title = clean_title,
    author = clean_author,
    publisher = clean_publisher,
    published_date = clean_published_date,
    isbn_10 = clean_isbn_10,
    isbn_13 = clean_isbn_13,
    cover_url = clean_cover_url,
    metadata_status = case when clean_publisher is not null
      and (clean_isbn_13 is not null or clean_isbn_10 is not null)
      and clean_cover_url is not null then 'complete' else 'draft' end,
    updated_at = now()
  where id = saved_book.id
  returning * into saved_book;

  return next saved_book;
end;
$$;

revoke all on function public.update_book_metadata(bigint,text,text,text,text,text,text,text) from public;
grant execute on function public.update_book_metadata(bigint,text,text,text,text,text,text,text) to authenticated;

drop policy if exists "Registered users can create rooms" on public.reading_rooms;
create policy "Registered users can create rooms"
on public.reading_rooms
as restrictive
for insert
to authenticated
with check (
  (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  and owner_id = auth.uid()
  and length(trim(name)) between 1 and 100
);

drop policy if exists "Registered users can update books" on public.books;
create policy "Registered users can update books"
on public.books
as restrictive
for update
to authenticated
using ((auth.jwt() ->> 'is_anonymous') is distinct from 'true')
with check ((auth.jwt() ->> 'is_anonymous') is distinct from 'true');

-- Keep UPDATE during the rollout so the currently deployed client remains
-- compatible until the RPC-based client is live. Existing RLS still limits
-- updates to a creator or room owner; anonymous users are blocked above.
revoke insert, delete on public.books from authenticated;

drop policy if exists "Room members can receive realtime" on realtime.messages;
create policy "Room members can receive realtime"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) ~ '^(livekit-page-|live-room-)[a-zA-Z0-9_-]+$'
  and exists (
    select 1
    from public.reading_room_members member
    where member.user_id = auth.uid()
      and member.room_id::text = regexp_replace(
        (select realtime.topic()),
        '^(livekit-page-|live-room-)',
        ''
      )
  )
);

drop policy if exists "Room members can send realtime" on realtime.messages;
create policy "Room members can send realtime"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) ~ '^(livekit-page-|live-room-)[a-zA-Z0-9_-]+$'
  and exists (
    select 1
    from public.reading_room_members member
    where member.user_id = auth.uid()
      and member.room_id::text = regexp_replace(
        (select realtime.topic()),
        '^(livekit-page-|live-room-)',
        ''
      )
  )
);
