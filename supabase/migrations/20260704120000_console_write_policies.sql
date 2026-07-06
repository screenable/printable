-- Schreib-Policies für die Web-Konsole
--
-- Die Konsole nutzt den (anon/service) Supabase-Key und muss in diese Tabellen
-- schreiben. Vorerst bewusst offene Policies (using/​with check = true) – die
-- Härtung auf Per-Gerät-Identität ist aufgeschoben (siehe KONZEPT.md 3.5).
--
-- Behebt u.a.: "new row violates row-level security policy for table templates".

-- templates: Bon-Layouts anlegen/ändern (Bon-Editor)
alter table public.templates enable row level security;
do $$ begin
  create policy "templates full access" on public.templates
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- device_templates: Preis-Mix speichern (bisher nur SELECT-Policy vorhanden)
do $$ begin
  create policy "device_templates full access" on public.device_templates
    for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- voucher_pool: Codes in den Pool laden (INSERT fehlte)
do $$ begin
  create policy "voucher_pool insert for all" on public.voucher_pool
    for insert with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "voucher_pool delete for all" on public.voucher_pool
    for delete using (true);
exception when duplicate_object then null; end $$;
