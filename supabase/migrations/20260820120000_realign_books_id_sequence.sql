-- Existing books were inserted before catalog registration was introduced.
-- Keep the identity sequence ahead of those IDs so the first catalog insert
-- cannot collide with an existing primary key.

select setval(
  pg_get_serial_sequence('public.books', 'id'),
  coalesce((select max(id) from public.books), 0) + 1,
  false
);
