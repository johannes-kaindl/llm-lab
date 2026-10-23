# Entscheidungen in llm-lab — das Warum

Verdichtete Design-Essenz zu den Regeln im Kern (`AGENTS.md`) und in `.claude/rules/`. Die Herleitungen liegen im Cockpit des Maintainers (CORE-META-14). Vor dem Übernehmen einer Altentscheidung gilt Johannes' Regel: Grund aufsuchen, messen, ob er heute trägt, Ergebnis melden.

## Warum der Vertrag versioniert ist: die Bumps von `apiVersion`

**`apiVersion` ist der Vertrag, nicht der Compiler.** Zwei eigenständige Repos (PROF-OBS-09) dürfen kein Build-Coupling eingehen — ein Konsument kopiert die Form (`LabLogInput`), importiert sie nie, und prüft `apiVersion` gegen seine eigene Konstante, bevor er sich auf die Form verlässt. Die Geschichte der Bumps (Wortlaut aus der `AGENTS.md` vor der Kürzung, Welle 25; der Stand heute steht im Kern):

- **Sie stand ab 2026-08-23 auf `2`** (`LLM_LAB_API_VERSION`, `plugin_api.ts`): `LabLogInput` trug damit zusätzlich die beiden optionalen Steuerfelder `secrets?: string[]` und `contextPaths?: string[]`. Der Bump war die erste gemessene Anwendung dieser Regel im Workspace — ein Konsument, der strikt auf `1` prüfte, schwieg bis zu seinem Nachzug, und genau das sollte er tun. Der Preis war ein koordiniertes Doppel-Release in fester Reihenfolge: **Anbieter zuerst, Konsument danach.**
- **Sie steht seit 2026-08-30 auf `3`** (`LLM_LAB_API_VERSION`, `plugin_api.ts`): `LabLogInput` trägt zusätzlich `promptTemplate?: string` — den stabilen Anteil des System-Prompts. Das ist der zweite Bump; das Verfahren (Anbieter zuerst, Konsument danach) ist damit kein Einzelfall mehr, sondern der eingespielte Weg.
- **Sie steht seit 2026-09-03 auf `4`** (`LLM_LAB_API_VERSION`, `plugin_api.ts`): `LabLogInput` trägt zusätzlich `turnId?: string` — die Klammer um mehrere Aufrufe EINER Nutzer-Handlung. Anlass ist der bevorstehende Anschluss von `koda-agent`, dessen Agent-Loop pro Handlung mehrere Aufrufe macht: wer einen einzelnen davon bewertet, bewertet ein Fragment. Dritter Bump, gleiches Verfahren — **Anbieter zuerst, Konsument danach.**

## Verhältnis zum Kit

- **Die Redaktion kommt seit Welle 16 aus code-kit `redact` (damals 0.18.0, heute siehe `tools/kit-sync.json`), vendort nach `src/vendor/kit/redact.ts`:** `redactKeysInValue` (Schlüssel, wirft fail-closed — `TraceStore.writeNow` fängt) und `createPiiRedactor({ extra })` (PII mit record-weiten Platzhaltern). Die plugin-eigene `redact_secrets.ts` ist weg, `redact_pii.ts` bleibt als dünner Mantel um den Kit-Redaktor, weil er den plugin-eigenen `TraceRecord` trägt. Die Kopier-Kette mit `vault-crews` (Übernahme 2026-08-22) endet damit.
- **Der REGISTRY-Kandidat `TraceStore`** (`neurovim-standalone`) wird **nicht** eingelöst: 23 Zeilen ohne Rotation, ohne Schema, ohne Redaktion. Was hier entsteht, ist reicher und bleibt zunächst im Lab, nicht im Kit. Der Kandidaten-Eintrag bleibt offen.
- **Der i18n-Modul-Ebenen-Wächter** (`tests/i18n/keys.test.ts`) ist seit 2026-08-30 **übernommen aus `vault-rag/tests/i18n/keys.test.ts`** (Herkunftsstempel im Kopf der Datei), nicht mehr eine eigene Linie. Vorher standen hier zwei getrennte Textscanner (`moduleLevelDeclOffender` + `classFieldOffender`); beide meldeten einen **Ausdrucks-Arrow** fälschlich — `const f = (): string => t("k")` genauso wie das Klassenfeld `getLabel = () => t("k")` —, obwohl dessen Rumpf erst beim Aufruf läuft. Gemeldet hatte den Klassenfeld-Fall die vault-rag-Session am 2026-08-23; dass **auch die Modul-Ebene** betroffen war, zeigte erst der rote Selbsttest. vault-rags Fassung löst beides in EINEM Klammer-Tiefen-Tracker (Stack `"fn"`/`"class"`/`"other"`, verankerte Arrow-Ausnahme) und hat die Klassenfeld-Erkennung, die früher nur hier stand, inzwischen selbst — sie war damit in beiden Punkten die reichere. Der frühere Rückportier-Kandidat ist erledigt, in der anderen Richtung.

**Eine Ergänzung gegenüber der Vorlage, und sie ist ein Rückportier-Kandidat für `vault-rag`:** `stripBlockComments` entfernt `/* … */` über Zeilengrenzen hinweg. Ohne das meldet der Wächter ein `t("…")` in einem Doc-Kommentar als eifrigen Aufruf — gemessen an `src/vendor/kit/i18n.ts:25` (`@example t("view.cardHead", 3, 7, "foo")`). `vault-rag` sieht das nur deshalb nicht, weil es `src/vendor/` ausklammert; die Lücke liegt im Scanner, nicht im Verzeichnis, und ein `@example` im eigenen Code trifft sie genauso. Hier wurde deshalb der Scanner repariert statt das Verzeichnis ausgeklammert — Ausklammern hätte den Wächter für die vendorierten Dateien ganz abgeschaltet.

**17 Selbsttests** (vorher: keiner). Der Wächter lief bis dahin ausschließlich gegen `src/`, und dort ist „keine Fundstelle" sowohl das Ergebnis eines gesunden Repos als auch das eines kaputten Wächters. Mutationsprobe gefahren (2026-08-30): je eine eingeschleuste Modul-Konstante und ein eingeschleustes Klassenfeld werden mit `datei:zeile` gemeldet.

## Kein UI über die Einstellungen hinaus — das war eine Slice-1-Aussage

**Slice 1 verzichtete bewusst auf jede Oberfläche außer dem Settings-Tab.** Kein Bewertungs-Knopf, kein Datensatz-Browser, kein Export-Dialog — alle drei setzten eine Datensatz-Schicht voraus, die damals nicht existierte (s. Datenmodell in `docs/internal/architecture.md`). Der Abschnitt bleibt stehen, weil die Begründung für diese Slice-1-Entscheidung weiter Erklärwert hat.

**Seit Slice A ("Bewerten") gilt das nicht mehr — bewusst, nicht als Rückfall in eine UI-Wildwuchs-Phase.** Es gibt jetzt eine eigene Bewertungs-Ansicht (`LabView`, Hub im Hauptbereich, s. Modul-Layout in `docs/internal/architecture.md`), erreichbar über ein Ribbon-Icon und den Command `open-view`, dazu zwei weitere Commands für den Durchratter-Rhythmus (`rate-up`, `rate-down`) und einen zum Löschen (`delete-record`). Die Statusleiste und `toggle-pause` bleiben; wer eine UI für eine künftige Slice baut, prüft weiter zuerst `UI-STANDARD.md` im Dach.

## Warum die beiden Lücken aus Slice 1 offen blieben

Beschreibung der beiden Lücken und ihrer Schließung: `.claude/rules/vertrag-und-ausschluss.md`.

**Warum sie überhaupt offen blieben:** beides ließ sich nur über den **öffentlichen API-Vertrag** schließen, und der war zum Zeitpunkt des Befundes bereits abgenommen — samt der Konsumenten-Verdrahtung in `vault-rag`. Ein Vertrags-Umbau ist kein Dokumentationsfix; er wurde deshalb bewusst als eigenes Vorhaben mit eigenem Versionsbump und koordiniertem Doppel-Release geführt statt nachträglich in eine abgenommene Slice gepatcht.
