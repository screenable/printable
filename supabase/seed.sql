-- Beispiel-Seed für eine Box. Anpassen und in Supabase ausführen (oder via
-- `supabase db reset`). Setzt voraus, dass in `templates` bereits Layouts mit
-- den Namen unten liegen (können über den Bon-Editor angelegt werden).

-- 1) Gerät + zentrale Config (entspricht DeviceConfig / devices.config)
insert into public.devices (id, name, location, config)
values (
  'box-edeka-nord-01',
  'EDEKA Nord – Eingang',
  'Hamburg',
  jsonb_build_object(
    'printer',  jsonb_build_object('host','192.168.100.200','port',9100,'model','epson-tm-m30iii'),
    'gpio',     jsonb_build_object('buttonPin',17,'debounceMs',10,'buzzerLedPin',5),
    'neopixel', jsonb_build_object('count',12,'gpio',18,'brightness',80),
    'led',      jsonb_build_object('doneHoldMs',2200,'errorHoldMs',3000,'workingFallbackMs',15000),
    'dispense', jsonb_build_object('cooldownMs',1000,'redeemBaseUrl','https://app.screenable.io/r/')
  )
)
on conflict (id) do update set config = excluded.config;

-- 2) Template-Mix (Preis = Template + Gewicht + Limit + Reward)
insert into public.device_templates
  (device_id, template_id, probability, cooldown_sec, data, reward_type, voucher_category, daily_limit, total_limit, is_fallback)
select 'box-edeka-nord-01', t.id, v.probability, v.cooldown_sec, v.data::jsonb,
       v.reward_type::reward_type, v.voucher_category, v.daily_limit, v.total_limit, v.is_fallback
from (values
  -- name, gewicht, cooldown, data, reward, kategorie, tageslimit, gesamtlimit, fallback
  ('edeka-frische-10', 22,  0, '{"price":"10%"}', 'unique', 'edeka-frische-10', null::int, null::int, false),
  ('edeka-frische-25', 11, 10, '{"price":"25%"}', 'unique', 'edeka-frische-25', 40,        200,       false),
  ('edeka-frische-50',  2, 60, '{"price":"50%"}', 'unique', 'edeka-frische-50', 2,         50,        false),
  ('trost-wurst',      65,  0, '{}',              'none',   null,               null,      null,      true)
) as v(name, probability, cooldown_sec, data, reward_type, voucher_category, daily_limit, total_limit, is_fallback)
join public.templates t on t.name = v.name
on conflict (device_id, template_id) do nothing;

-- 3) Ein paar Beispiel-Codes in den Pool (Bestandslimit = Anzahl im Pool)
insert into public.voucher_pool (code, category)
values
  ('FRISCHE10-AAA1','edeka-frische-10'),
  ('FRISCHE10-AAA2','edeka-frische-10'),
  ('FRISCHE25-BBB1','edeka-frische-25'),
  ('FRISCHE50-CCC1','edeka-frische-50')
on conflict (code) do nothing;
