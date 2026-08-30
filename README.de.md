# LLM Lab

**Zeichnet jeden lokalen LLM-Aufruf deiner Obsidian-Plugins auf, damit die guten Antworten bewertet und zu Auswertungs- oder Fine-Tuning-Material werden können.**

[![Lizenz: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://git.jkaindl.de/jkaindl/llm-lab/src/branch/main/LICENSE)
[![Doku: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://git.jkaindl.de/jkaindl/llm-lab/src/branch/main/LICENSE-DOCS)
![Plattform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20desktop%20%26%20mobile-7c3aed)

> Englisch ist die kanonische Fassung: [README.md](README.md).

## Was es tut

Mehrere Obsidian-Plugins in diesem Workspace sprechen mit lokalen LLMs (ein RAG-Assistent,
ein Chat-Plugin, ein Crew-Orchestrator, ein Suchen-und-Ersetzen-Plugin) — und keines von
ihnen hält fest, wie gut diese Aufrufe eigentlich laufen. LLM Lab ist ein kleiner, stiller
Rekorder, den ein Nachbarplugin einmal je LLM-Interaktion aufruft:

```ts
const lab = app.plugins.plugins["llm-lab"]?.api;
lab?.log({ plugin: "vault-retrieval", feature: "chat", model, endpointUrl, messages, content, latencyMs, /* … */ });
```

Dieser eine Aufruf schreibt eine Zeile in ein rotierendes, nur anhängendes Protokoll — das
verwendete Modell, die vollständige Nachrichtenliste, die Antwort, die Zeiten und ob der
Aufruf fehlschlug oder an einer Token-Grenze abgeschnitten wurde. Mehr passiert von selbst
nicht: LLM Lab ruft kein Modell auf, spricht nicht mit dem Netz und liest oder schreibt
nichts in deinen Notizen.

## Was es **nicht** tut

- **Es ist kein LLM-Client.** Es schickt nie eine Anfrage an ein Modell oder einen Endpunkt —
  es zeichnet nur auf, was ein *anderes* Plugin bereits gesendet und empfangen hat.
- **Es arbeitet nicht allein.** LLM Lab zu installieren, ohne dass ein anderes Plugin seine
  API aufruft, zeichnet überhaupt nichts auf. Es ist Infrastruktur für Plugin-Autoren, kein
  eigenständiges Feature für Endnutzer.
- **Slice 1 liefert keine Bewertungs-Oberfläche, keinen Datensatz-Browser und keinen Export.**
  Alle drei setzen eine bewertete Datensatz-Schicht voraus, die dieses Release bewusst noch
  nicht baut — was kommt, steht im Changelog. Derzeit hat LLM Lab genau eine sichtbare
  Oberfläche: seinen Einstellungs-Tab.
- **Es findet nicht alles Sensible.** Siehe den Abschnitt unten — das ist die eine Stelle in
  dieser README, die nicht weich sein darf.

## Funktionsweise

**Was aufgezeichnet wird, und wo.** Jeder Trace landet als eine JSON-Zeile in
`.obsidian/plugins/llm-lab/traces/YYYY-MM-DD.jsonl` — im Klartext, innerhalb des Vaults, in
dem das aufzeichnende Plugin installiert ist. Es gibt keine separate Datenbank, kein
Cache-Verzeichnis außerhalb des Vaults und keinen Netz-Endpunkt, an den etwas gemeldet wird.

Daraus folgt unmittelbar: **ob dieser Ordner gesynct oder gesichert wird, entscheidet allein
die Konfiguration deines Vaults, nicht LLM Lab.** Spiegelt dein Sync-Setup
`.obsidian/plugins/` (oder sicherst du den ganzen Vault), wandern die Trace-Dateien dorthin,
wohin dieses Setup ohnehin alles schickt. LLM Lab fügt keinen Sync-Mechanismus hinzu — und
nimmt sich von deinem bestehenden auch nicht aus.

Bevor etwas geschrieben wird, sucht ein Maskierungslauf nach **Bearer-Token, die wörtlich im
aufgezeichneten Text auftauchen** (`Bearer <token>`), und ersetzt sie — dieses Muster ist real
und läuft immer. **Auch Endpunkt-API-Schlüssel werden bei jedem Schreibvorgang durch exakte
Übereinstimmung maskiert:** ein aufrufendes Plugin gibt seine Schlüssel beim Aufruf mit
(`secrets` in der Aufzeichnungs-API); sie dienen ausschließlich als Maskierungsliste und
werden nie Teil des Records. **Die Bedingung, die man kennen sollte:** LLM Lab hat keine
eigene Schlüsselliste — abgedeckt sind nur die Schlüssel, die ein aufrufendes Plugin
tatsächlich übergibt. Ein Plugin, das keine übergibt, ist wieder allein auf das
`Bearer`-Muster angewiesen. Getrennt davon — und nur wenn die
strengere Einstellung „Personenbezogenes auch im rohen Trace maskieren" eingeschaltet ist
(Standard: aus) — läuft ein zweiter Durchgang über die Nachrichten- und Antworttexte:

**Die Maskierung findet Muster. Sie ist bewusst nicht darauf angesetzt, Bedeutung zu finden.**
Konkret erkennt sie:

- E-Mail-Adressen
- IBANs
- Telefonnummern
- Zugangsdaten in einer URL (`user:pass@host`)

und ersetzt jedes durch einen nummerierten Platzhalter (`[EMAIL_1]`, `[IBAN_1]`, …), der über
alle Textfelder **eines** Records hinweg gleich bleibt — dieselbe Adresse bekommt im Prompt
und in der Antwort dieselbe Nummer.

**Sie findet *nicht*, und wird per Mustererkennung nie finden:**

- Namen
- Anschriften
- medizinische oder andere Diagnosen
- Beziehungen zwischen Personen („meine Tochter", „unser Steuerberater")

Enthält ein Gespräch so etwas — und ein System-Prompt oder ein aus deinen eigenen Notizen
zusammengestellter RAG-Kontext kann das durchaus —, wird es standardmäßig exakt so
aufgezeichnet, wie es dasteht, in der rohen Trace-Datei. Der Schalter in den Einstellungen
dehnt dieselbe, rein musterbasierte Maskierung auch auf den rohen Trace aus, aber die Grenze
oben bleibt: Es ist kein allgemeiner Anonymisierer und nach keinem Compliance-Standard
geprüft. Behandle jeden aufgezeichneten Trace als genauso vertraulich wie die Notizen und
Prompts, aus denen er entstanden ist — dieser Abschnitt existiert, um ein falsches
Sicherheitsgefühl zu verhindern, nicht um eines zu erzeugen.

**Ganze Ordner lassen sich auch komplett aus dem Protokoll heraushalten.** Trag sie unter
„Notizen aus diesen Ordnern nie mitschreiben" ein — ein Aufruf, in den eine Notiz daraus
eingeflossen ist, wird gar nicht erst geschrieben; es entsteht kein Record, an dem später noch
etwas zu redigieren wäre. Unterordner zählen mit. „Strenger Ordner-Ausschluss" (Standard: an)
heißt: eine *einzige* ausgeschlossene Notiz genügt, um den Aufruf zu überspringen; aus
geschaltet entfällt der Aufruf nur, wenn *alle* beteiligten Notizen ausgeschlossen sind.
**Die Bedingung, klar benannt, weil es eine Zusage mit Grenze ist:** Der Filter greift nur bei
Aufrufen, die dem LLM Lab mitteilen, welche Notizen eingeflossen sind — und **die Grenze läuft
je Aufruf, nicht je Plugin.** Ein Aufruf ohne Pfade wird wie bisher mitgeschrieben, auch von
einem Plugin, das sonst meldet: In vault-rags Chat meldet eine Frage ohne angehängte
Kontextnotizen nichts, weil keine Notiz beteiligt war. LLM Lab bringt Aufrufer, die keine Pfade
melden können, bewusst nicht zum Schweigen.

**Es wird nichts aufgezeichnet, solange kein Nachbarplugin die API aufruft, und das
Deinstallieren von LLM Lab ist der Ausschalter.** Es gibt kein Konto, keine Lizenzprüfung und
keinen Hintergrunddienst, den man abschalten müsste — das Plugin aus einem Vault zu entfernen
beendet dort sofort jede Aufzeichnung.

## Voraussetzungen

- **Obsidian 1.8.7 oder neuer.** Desktop und mobil — LLM Lab fasst keine Node-API an und ist
  nicht als desktop-only markiert.
- **Mindestens ein anderes Plugin, das die API aufruft.** Für sich allein zeichnet LLM Lab
  nichts auf; es ist Infrastruktur für Plugin-Autoren. Erster Konsument ist
  [vault-rag](https://github.com/johannes-kaindl/vault-rag).
- **Kein Netzzugang, kein Konto, kein Modell.** Es muss nichts weiter installiert oder
  erreichbar sein — nicht einmal das LLM, mit dem deine anderen Plugins sprechen, denn LLM Lab
  spricht selbst nie mit ihm.

## Installation

### Aus einem Release

`main.js`, `manifest.json` und `styles.css` vom
[neuesten Release](https://github.com/johannes-kaindl/llm-lab/releases/latest) herunterladen,
nach `<vault>/.obsidian/plugins/llm-lab/` legen und das Plugin unter
**Einstellungen → Community-Plugins** aktivieren. LLM Lab ist (noch) **nicht** im
Plugin-Browser — die Installation ist so oder so manuell.

### Aus dem Quelltext

```bash
git clone https://git.jkaindl.de/jkaindl/llm-lab
cd llm-lab
npm install
npm run build   # erzeugt main.js
```

`main.js`, `manifest.json` und `styles.css` nach `<vault>/.obsidian/plugins/llm-lab/` kopieren
und das Plugin unter **Einstellungen → Community-Plugins** aktivieren.

## Verwendung

Es gibt nichts zu starten und nichts zu klicken. Sobald ein Nachbarplugin die API aufruft,
läuft die Aufzeichnung von selbst — und die einzigen drei Dinge, die du je mit LLM Lab tust,
sind diese:

- **Auf die Statusleiste sehen.** Sie zeigt ein Punkt-Symbol und *„Lab: schreibt mit"* oder
  ein Pause-Symbol und *„Lab: pausiert"*. Symbol **und** Text, nie Farbe allein.
- **Für diese Sitzung pausieren.** Befehlspalette → **„LLM Lab: Mitschreiben pausieren oder
  fortsetzen"**. Die Pause wird bewusst nicht gespeichert: Sie endet beim nächsten Start,
  damit niemand nach einem *„gerade nicht"* wochenlang stumm pausiert bleibt.
- **Die Traces lesen.** Sie sind schlichtes JSONL in
  `<vault>/.obsidian/plugins/llm-lab/traces/YYYY-MM-DD.jsonl` — ein Aufruf je Zeile, lesbar mit
  jedem Editor, mit `jq` oder per Skript:

  ```bash
  jq -r 'select(.feature == "chat") | [.model, .latencyMs, .ttftMs] | @tsv' \
    "<vault>/.obsidian/plugins/llm-lab/traces/2026-08-23.jsonl"
  ```

Das Plugin auszuschalten — oder zu entfernen — beendet die Aufzeichnung in diesem Vault sofort.

## Konfiguration

| Einstellung | Standard | Wirkung |
|---|---|---|
| **LLM-Aufrufe mitschreiben** | an | Hauptschalter. Aus wird kein Trace geschrieben, egal wer die API aufruft. |
| **Traces aufbewahren (Tage)** | 7 | Ältere Trace-Dateien werden bei der Rotation gelöscht. Die heutige Datei nie. |
| **Maximale Trace-Größe (MB)** | 20 | Überschreiten die aufbewahrten Dateien diese Grenze, werden die ältesten zuerst gelöscht — die heutige ist ausgenommen. |
| **Diese Features nie mitschreiben** | `settings-probe` | Eine Feature-Kennung je Zeile. Der typische Fall sind die Verbindungstests eines aufrufenden Plugins — Verkehr, der keine echte Interaktion ist. |
| **Notizen aus diesen Ordnern nie mitschreiben** | *(leer)* | Ein Ordnerpfad je Zeile, Unterordner zählen mit. Ein Aufruf, in den eine Notiz daraus eingeflossen ist, wird nicht geschrieben. Greift nur bei Aufrufen, deren Plugin die beteiligten Notizen meldet. |
| **Strenger Ordner-Ausschluss** | an | An: eine einzige ausgeschlossene Notiz verhindert den ganzen Aufruf. Aus: der Aufruf entfällt nur, wenn ALLE beteiligten Notizen ausgeschlossen sind. |
| **Zusätzliche Begriffe maskieren** | *(leer)* | Ein Begriff je Zeile, zusätzlich zu den eingebauten Mustern für E-Mail/IBAN/Telefon/URL-Zugangsdaten — gleich maskiert, mit derselben Platzhalter-Konsistenz. Wirkt nur, solange der Schalter darüber an ist. |
| **Personenbezogenes auch im rohen Trace maskieren** | aus | Wendet die PII-Maskierung auch auf den rohen Trace an, nicht nur auf einen künftigen bewerteten Datensatz. Standardmäßig aus, weil das Debuggen einer schlechten Antwort sehen muss, was wirklich gesendet wurde. |

## Für Plugin-Autoren

LLM Labs einzige öffentliche Fläche für andere Plugins ist
`app.plugins.plugins["llm-lab"]?.api`:

```ts
interface LlmLabApi {
  readonly apiVersion: number;
  status(): { apiVersion: number; recording: boolean };
  log(input: LabLogInput): string; // gibt die Trace-id synchron zurück
}
```

`log()` ist bewusst fire-and-forget: Es gibt die vergebene id sofort zurück und schreibt
asynchron auf die Platte, damit ein Aufrufer mitten im Stream nie ausgebremst oder blockiert
wird. Die API defensiv lesen (LLM Lab ist womöglich nicht installiert) und `log()` **nie**
`await`en — es gibt nichts zu erwarten.

**`apiVersion` steht auf `3`.** Sie gegen die eigene Konstante prüfen, bevor man sich auf die
Form verlässt — diese Versionsnummer ist der Vertrag, bewusst anstelle einer Build-Kopplung
zwischen zwei eigenständigen Repositories. Version 3 ergänzt ein drittes optionales Feld zu
den beiden aus Version 2 — ein Konsument sollte alle füllen, die er kann:

- **`secrets?: string[]`** — die für diesen Aufruf verwendeten Endpunkt-Schlüssel. Sie dienen
  ausschließlich als Maskierungsliste und werden nie Teil des Records. Ohne sie werden nur
  wörtliche `Bearer`-Token erfasst.
- **`contextPaths?: string[]`** — die Vault-Pfade der Notizen, deren Inhalt in diesen Aufruf
  eingeflossen ist. Daran wird der Ordner-Ausschluss des Nutzers gemessen; ein Aufruf ohne
  Pfade wird immer mitgeschrieben.
- **`promptTemplate?: string`** — der stabile Anteil des System-Prompts: der Wortlaut, der eine
  Prompt-*Fassung* ausmacht, ohne Retrieval-Kontext und ohne Nutzereingabe. LLM Lab bildet
  daraus `promptTemplateHash`. Wer nichts meldet, bekommt keinen Hash — bewusst, denn ein Hash
  über einen System-Prompt mit Aufruf-Inhalt gruppiert nichts.

Der vollständige Vertrag und seine Begründung stehen in [`AGENTS.md`](AGENTS.md).

## Mitwirken

Beiträge sind willkommen. Der Arbeitsablauf steht in [CONTRIBUTING.md](CONTRIBUTING.md)
(test-getrieben, `main` immer grün, Feature-Arbeit in `feat/<name>`, Conventional Commits),
Architektur und Modul-Konventionen in [AGENTS.md](AGENTS.md). Das kanonische Repository liegt
auf Forgejo (`git.jkaindl.de/jkaindl/llm-lab`); GitHub (`johannes-kaindl/llm-lab`) ist ein
Spiegel.

## Lizenz

- **Code:** [AGPL-3.0-or-later](LICENSE). Eine kommerzielle Zweitlizenz ist auf Anfrage verfügbar, falls das AGPL-Copyleft nicht zu deinem Anwendungsfall passt.
- **Dokumentation und Texte:** [CC BY-SA 4.0](LICENSE-DOCS).

Copyright © 2026 Johannes Kaindl.
