-- Nutzung nach Tagesstunde (für das Stoßzeiten-Liniendiagramm).
-- Aggregiert print_jobs im Zeitraum nach lokaler Stunde (Default Europe/Berlin),
-- damit die Konsole erkennen kann, wann die Box am meisten genutzt wird.
create or replace function public.dispense_by_hour(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_tz        text default 'Europe/Berlin'
)
returns table (hour int, count bigint)
language sql
stable
as $$
  select extract(hour from (pj.created_at at time zone p_tz))::int as hour,
         count(*)                                                   as count
  from public.print_jobs pj
  where pj.data->>'device_id' = p_device_id
    and pj.created_at >= p_from
    and pj.created_at <  p_to
  group by 1
  order by 1;
$$;
