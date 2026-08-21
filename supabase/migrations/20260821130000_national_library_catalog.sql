-- Allow books selected from the National Library of Korea catalog.
-- The original function remains unchanged except for its source allowlist.
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.save_catalog_book(text,text,text,text,text,text,text,text,text)'::regprocedure
  ) into definition;

  if definition not like '%national_library%' then
    definition := replace(
      definition,
      $needle$clean_source not in ('manual', 'open_library', 'google_books')$needle$,
      $replacement$clean_source not in ('manual', 'open_library', 'google_books', 'national_library')$replacement$
    );
    execute definition;
  end if;
end;
$$;

revoke all on function public.save_catalog_book(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.save_catalog_book(text,text,text,text,text,text,text,text,text) to authenticated;
