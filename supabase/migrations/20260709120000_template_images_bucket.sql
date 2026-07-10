-- Storage-Bucket für selbst hochgeladene Template-Bilder (Bon-Editor).
--
-- Der Bon-Editor optimiert Bilder vor dem Upload auf die Bonbreite des Druckers
-- (TM-m30III: 576 Dots = 72 mm bei 203 dpi) und legt sie hier ab. Das Bild-
-- Element speichert dann nur die öffentliche URL in `templates.template`; der Pi
-- lädt sie über den ImageCache offline-fest nach.
insert into storage.buckets (id, name, public)
values ('template-images', 'template-images', true)
on conflict (id) do nothing;

-- Offene Policies (analog zu console_write_policies.sql). Die Härtung auf
-- Per-Gerät-Identität ist bewusst aufgeschoben – siehe KONZEPT.md 3.5.
do $$ begin
  create policy "template-images read" on storage.objects
    for select using (bucket_id = 'template-images');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "template-images insert" on storage.objects
    for insert with check (bucket_id = 'template-images');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "template-images update" on storage.objects
    for update using (bucket_id = 'template-images') with check (bucket_id = 'template-images');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "template-images delete" on storage.objects
    for delete using (bucket_id = 'template-images');
exception when duplicate_object then null; end $$;
