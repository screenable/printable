-- Zähler-Reset aus der Konsole (auch für statische Codes)
--
-- Der Gesamt-Zähler (devices.dispensed) wird von der Box lokal geführt und per
-- Heartbeat gemeldet. seedTotals() zählt bewusst NIE herunter (robust gegen
-- Re-Image) – dadurch ließ sich der Zähler bisher nicht zurücksetzen: ein
-- Überschreiben von dispensed in der Konsole würde die Box beim nächsten
-- Heartbeat einfach wieder hochziehen.
--
-- Analog zum Fern-Neustart setzt die Konsole nun dispensed_reset_at = now() und
-- schreibt das gewünschte (reduzierte) dispensed. Die Box vergleicht den Wert
-- beim Sync mit dem zuletzt verarbeiteten (lokal gemerkt) und übernimmt bei einem
-- neueren Zeitpunkt die gemeldeten Zähler EINMALIG exakt (inkl. Herunterzählen).
-- So wirkt das Zurücksetzen auch für statische Codes, ohne den Re-Image-Schutz im
-- Normalbetrieb aufzugeben.

alter table public.devices
  add column if not exists dispensed_reset_at timestamptz;
