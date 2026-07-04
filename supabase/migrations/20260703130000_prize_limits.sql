-- Prize-Limits & Telemetrie
--
-- total_limit: Gesamt-Stückzahl je Preis (auch für statische Codes) – die Box
--   setzt es lokal per persistentem Zähler durch (offline-fest). null = unbegrenzt.
-- devices.dispensed: von der Box gemeldete Ausgabe-Zähler je Template-Name,
--   damit die Konsole „Ausgegeben / Verbleibend / erschöpft" anzeigen kann.

alter table public.device_templates
  add column if not exists total_limit int;

alter table public.devices
  add column if not exists dispensed jsonb not null default '{}'::jsonb;
