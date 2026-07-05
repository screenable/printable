-- Fern-Neustart einer Box aus der Konsole (ohne SSH).
--
-- Die Konsole setzt restart_requested_at = now(); die Box vergleicht den Wert
-- beim Sync mit dem zuletzt verarbeiteten (lokal gemerkt) und startet sich per
-- systemd neu, wenn er neuer ist. Kein Neustart-Loop, da die Box den Zeitpunkt
-- vor dem Exit persistiert.

alter table public.devices
  add column if not exists restart_requested_at timestamptz;
