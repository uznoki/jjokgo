-- 쪽GO 도서 카탈로그·임시 등록 v1
-- 기존 books 테이블을 보존하면서 검색 결과와 수동 등록 메타데이터를 확장합니다.

alter table public.books
  add column if not exists author text,
  add column if not exists publisher text,
  add column if not exists published_date text,
  add column if not exists isbn_10 text,
  add column if not exists isbn_13 text,
  add column if not exists cover_url text,
  add column if not exists description text,
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists metadata_status text not null default 'draft',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists books_isbn_13_idx on public.books (isbn_13) where isbn_13 is not null;
create index if not exists books_external_source_idx on public.books (source, external_id) where external_id is not null;
create index if not exists books_title_author_idx on public.books (lower(title), lower(coalesce(author, '')));

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
set search_path = public
as $$
declare
  saved_book public.books%rowtype;
  clean_title text := nullif(trim(p_title), '');
  clean_author text := nullif(trim(p_author), '');
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if clean_title is null then
    raise exception 'BOOK_TITLE_REQUIRED' using errcode = 'P0001';
  end if;
  if coalesce(nullif(trim(p_source), ''), 'manual') = 'manual' and clean_author is null then
    raise exception 'BOOK_AUTHOR_REQUIRED' using errcode = 'P0001';
  end if;

  select * into saved_book
  from public.books
  where (nullif(trim(p_external_id), '') is not null and source = p_source and external_id = trim(p_external_id))
     or (nullif(regexp_replace(coalesce(p_isbn_13, ''), '[^0-9]', '', 'g'), '') is not null and isbn_13 = regexp_replace(p_isbn_13, '[^0-9]', '', 'g'))
     or (lower(title) = lower(clean_title) and lower(coalesce(author, '')) = lower(coalesce(clean_author, '')))
  order by id
  limit 1;

  if saved_book.id is not null then
    update public.books set
      author = coalesce(author, clean_author),
      publisher = coalesce(publisher, nullif(trim(p_publisher), '')),
      published_date = coalesce(published_date, nullif(trim(p_published_date), '')),
      isbn_10 = coalesce(isbn_10, nullif(regexp_replace(coalesce(p_isbn_10, ''), '[^0-9Xx]', '', 'g'), '')),
      isbn_13 = coalesce(isbn_13, nullif(regexp_replace(coalesce(p_isbn_13, ''), '[^0-9]', '', 'g'), '')),
      cover_url = coalesce(cover_url, nullif(trim(p_cover_url), '')),
      metadata_status = case when
        coalesce(publisher, nullif(trim(p_publisher), '')) is not null and
        (coalesce(isbn_13, nullif(trim(p_isbn_13), '')) is not null or coalesce(isbn_10, nullif(trim(p_isbn_10), '')) is not null) and
        coalesce(cover_url, nullif(trim(p_cover_url), '')) is not null
        then 'complete' else metadata_status end,
      updated_at = now()
    where id = saved_book.id
    returning * into saved_book;
  else
    insert into public.books (
      title, author, publisher, published_date, isbn_10, isbn_13, cover_url,
      source, external_id, metadata_status, created_by
    ) values (
      clean_title, clean_author, nullif(trim(p_publisher), ''), nullif(trim(p_published_date), ''),
      nullif(regexp_replace(coalesce(p_isbn_10, ''), '[^0-9Xx]', '', 'g'), ''),
      nullif(regexp_replace(coalesce(p_isbn_13, ''), '[^0-9]', '', 'g'), ''),
      nullif(trim(p_cover_url), ''), coalesce(nullif(trim(p_source), ''), 'manual'),
      nullif(trim(p_external_id), ''),
      case when nullif(trim(p_publisher), '') is not null
        and (nullif(trim(p_isbn_13), '') is not null or nullif(trim(p_isbn_10), '') is not null)
        and nullif(trim(p_cover_url), '') is not null then 'complete' else 'draft' end,
      auth.uid()
    ) returning * into saved_book;
  end if;

  return next saved_book;
end;
$$;

alter table public.books enable row level security;

drop policy if exists "Authenticated users can view books" on public.books;
create policy "Authenticated users can view books"
on public.books for select to authenticated using (true);

drop policy if exists "Book creators and room owners can update books" on public.books;
create policy "Book creators and room owners can update books"
on public.books for update to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.reading_rooms room
    where room.book_id = books.id and room.owner_id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1 from public.reading_rooms room
    where room.book_id = books.id and room.owner_id = auth.uid()
  )
);

revoke all on function public.save_catalog_book(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.save_catalog_book(text,text,text,text,text,text,text,text,text) to authenticated;
grant select, update on public.books to authenticated;
