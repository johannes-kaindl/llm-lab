# Architektur von llm-lab

Aufbau des Plugins, zum Nachschlagen. Was beim Arbeiten beißt, steht im Kern der `AGENTS.md` und in `.claude/rules/`; das Warum in `decisions.md`.

## Datenmodell — zwei Schichten, eine Bewegung

```
<plugin-config-dir>/llm-lab/
  traces/YYYY-MM-DD.jsonl   flüchtig · roh · rotiert (Tage + harte MB-Grenze)
  dataset.jsonl             bleibend · redigiert · nur Bewertetes
```

Der **Trace** ist die flüchtige Rohschicht: append-only, eine Zeile je Aufruf, rotiert nach Alter und Gesamtgröße (heutige Datei nie gelöscht — sie ist die, in die gerade geschrieben wird). Der **Datensatz** ist die bleibende, redigierte Schicht: nur was ein Mensch bewertet, wird dorthin **kopiert** (nicht referenziert) — ein Trace verfällt mit der Rotation, ein kopierter Datensatz-Eintrag überlebt sie. Eine Referenz zeigte nach sieben Tagen ins Leere.

## Modul-Layout (`src/`)

```
core/
  types.ts          TraceRecord — das Feldset, das auf die Platte geschrieben wird.
  record.ts         TraceInput → TraceRecord: hashPrompt (FNV-1a, kein Krypto-Anspruch — nur
                    unterscheidbar, nicht geheim; laeuft seit `apiVersion` 3 ueber
                    `promptTemplate`, nicht mehr ueber die System-Nachricht) · hostOf
                    (Host+Port aus einer URL, faellt auf "unbekannt" zurueck statt zu
                    werfen) · buildTraceRecord.
  redact_pii.ts     redactPii — dünner Mantel um den Kit-Redaktor: Muster-Maskierung mit record-weiten
                    Platzhaltern, läuft nur, wenn redactPiiInTrace gesetzt ist (für den rohen Trace).
                    Die Schlüssel-Maskierung ist Kit `redactKeysInValue` und läuft unbedingt; ihre Liste
                    ist die Vereinigung aus deps.secrets() (leer) und den Aufruf-Schlüsseln
                    (LabLogInput.secrets); ohne Aufruf-Schlüssel wirkt nur das BEARER-Muster —
                    s. `.claude/rules/vertrag-und-ausschluss.md`.
  rotation.ts       planRotation — reine Entscheidung, welche Trace-Dateien weg müssen
                    (Alter + Größengrenze, heutige Datei geschützt), `today` als Parameter
                    statt `Date` für Zeitreise-freie Tests.
  settings.ts       LabSettings · DEFAULT_SETTINGS · pathsExcluded(paths, settings) —
                    Ordner-Ausschluss (Dateisystem-Lesart mit Ordnergrenze, fail-open ohne Pfade) ·
                    shouldLog(input: LogDecisionInput, paused, settings) — bündelt Feature-
                    UND Ordner-Ausschluss kurzschließend: enabled → paused → feature → Pfade.
  trace_store.ts    TraceStore — TraceSink-Port injiziert, write() fire-and-forget,
                    writeNow() awaitbar (nur für Tests), rotate() nach jedem Schreiben,
                    removeRecord() liefert seit Befund I4 `Promise<boolean>` (Erfolg/Misserfolg)
                    statt `Promise<void>` — bleibt fail-safe (wirft nie), meldet den Ausgang
                    aber ueber den Rueckgabewert statt nur per console.warn.
  i18n/strings.ts   EN/DE-Wörterbuch, importiert für den Registrierungs-Seiteneffekt.
  dataset.ts        RateInput/Verdict/DatasetEntry — was der Mensch beim Bewerten beisteuert
                    (Urteil, Tags, Notiz, Korrektur als SFT-Material) und die Zeilenform von
                    dataset.jsonl; buildDatasetEntry() baut aus TraceRecord + RateInput einen
                    redigierten Eintrag. parseJsonl() (geteilt mit trace_reader.ts) lebt hier.
  dataset_store.ts  DatasetStore — die bleibende Schicht (dataset.jsonl, NEBEN traces/, damit
                    `planRotation` sie strukturell nicht wegraeumen kann). add() haengt
                    an (kein try/catch — ein Schreibfehler wirft bewusst durch, s. Befund I4),
                    list() dedupliziert je trace.id ueber `ratedAt` (juengstes Urteil gewinnt,
                    nicht die Dateireihenfolge), ratedIds() ist die Grundlage des
                    "nur unbewertete"-Filters.
  trace_reader.ts   TraceReader/applyFilter/TraceFilter — liest alle Tages-Trace-Dateien ein
                    (zaehlt kaputte Zeilen durch, statt sie zu schlucken) und filtert/sortiert
                    rein (neueste zuerst, Fehler-Records nur im eigenen Filter, LISTEN_GRENZE
                    als harte Obergrenze fuer die DOM-Liste). `TraceReader.dayOf()` liefert den
                    Dateinamen-Tag, den `removeRecord` braucht.
obsidian/
  settings_tab.ts   LabSettingTab — ZWEIGLEISIG (seit 0.2.0): getSettingDefinitions() ist die
                    eine Struktur, get/setControlValue der Host, display() zeichnet dieselbe
                    Liste mit dem Kit-Walker nach (Obsidian < 1.13). Enthält die drei
                    inhaltlich verbindlichen Zeilen (Ablageort im Klartext, Grenzen der
                    Maskierung, Grenze des Ordner-Filters) — alle drei als `render`-Hatch,
                    s. `.claude/rules/settings-tab.md`.
  vault_sink.ts     vaultSink(adapter) — dünne Anpassung von Obsidians DataAdapter an
                    TraceSink; legt den Ordner beim ersten Schreiben an.
  lab_view.ts       LabView — die Bewertungs-Ansicht (VIEW_TYPE_LAB), registriert im
                    Hauptbereich, nicht der Seitenleiste (UI-STANDARD-Design, von Johannes
                    bestaetigt: bewerten heisst System-Prompt und Antwort vergleichen, eine
                    300px-Sidebar macht daraus eine Lese-Roehre). Duenne ItemView-Huelle um
                    `buildHubInto` (Kit-Hub-Muster) mit den Panels als LabTabId ("rate" ·
                    "stats" · "export" — nur "rate" ist gebaut).
  panels/
    rate_panel.ts       RatePanel — das Bewerten-Panel (HubPanel<"rate">). Filter-Leiste
                        (unbewertet/Fehler/Plugin/Modell), Zeilenliste, Detailansicht,
                        Aktionsleiste (gut/schlecht/vertiefen/löschen), Tastaturbedienung
                        j/k/g/b/Enter/Delete. DOM ist reine Funktion des gehaltenen Zustands
                        (UI-STANDARD §4) — nie aus dem DOM zurückgelesen. `weiter()` wählt
                        nach einem Urteil den nächsten Record über dessen id in der neu
                        gefilterten Liste, nicht über eine blinde Index-Verschiebung (Befund
                        I1); `bewerte()`/`vertiefe()`/`loesche()` fangen einen scheiternden
                        `host.rate()`/`host.remove()` und zeigen eine `Notice`, statt still
                        zu bleiben oder eine unhandled rejection zu erzeugen (Befund I4).
    rate_details_modal.ts  RateDetailsModal — Vertiefung zu einem Urteil (Tags, Notiz,
                        Korrektur). Löst mit `null` auf, wenn abgebrochen wird — ein
                        abgebrochener Dialog darf keine halbe Bewertung schreiben.
plugin_api.ts       createLlmLabApi — der öffentliche Vertrag (Kern der `AGENTS.md`).
main.ts             Plugin-Entry: Sprache setzen, Settings laden, TraceStore/API verdrahten,
                    Statusleiste, toggle-pause-Command, Settings-Tab registrieren, Ribbon-Icon
                    + View + vier Commands fuer die Bewertungs-Ansicht verdrahten.
vendor/kit/ und vendor/kit-obsidian/  Verbatim-Snapshots über `tools/kit-sync.json` (Pins und Modulliste dort und in
                            `VENDOR.json`). Nie von Hand editieren, `sh tools/sync-kit.sh --check` misst Drift.
                            Der `folder`-Zweig des Walkers ist drin (`folder-suggest` wird mitvendort, der
                            obsidian-Mock trägt `AbstractInputSuggest`).
```
