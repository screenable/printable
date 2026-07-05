-- Weitere Nutzungs-Aggregate: pro Kalendertag und pro Wochentag×Stunde.
-- Zeitzone Default Europe/Berlin, damit Uhrzeit/Wochentag lokal stimmen.

-- Ausgaben pro Kalendertag (für die Tages-Timeline über längere Zeiträume).
create or replace function public.dispense_by_day(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_tz        text default 'Europe/Berlin'
)
returns table (day date, count bigint)
language sql
stable
as $$
  select (pj.created_at at time zone p_tz)::date as day,
         count(*)                                as count
  from public.print_jobs pj
  where pj.data->>'device_id' = p_device_id
    and pj.created_at >= p_from
    and pj.created_at <  p_to
  group by 1
  order by 1;
$$;

-- Ausgaben pro Wochentag (isodow 1=Mo..7=So) und Stunde (für die Heatmap).
create or replace function public.dispense_by_weekday_hour(
  p_device_id text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_tz        text default 'Europe/Berlin'
)
returns table (dow int, hour int, count bigint)
language sql
stable
as $$
  select extract(isodow from (pj.created_at at time zone p_tz))::int as dow,
         extract(hour  from (pj.created_at at time zone p_tz))::int as hour,
         count(*)                                                    as count
  from public.print_jobs pj
  where pj.data->>'device_id' = p_device_id
    and pj.created_at >= p_from
    and pj.created_at <  p_to
  group by 1, 2
  order by 1, 2;
$$;
