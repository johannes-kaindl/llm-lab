# LLM Lab

**Zeichnet jeden lokalen LLM-Aufruf deiner Obsidian-Plugins auf, damit die guten Antworten bewertet und zu Auswertungs- oder Fine-Tuning-Material werden können.**

[![Lizenz: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/llm-lab/blob/main/LICENSE)
[![Doku: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/llm-lab/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/llm-lab?label=release)](https://github.com/johannes-kaindl/llm-lab/releases)
![Plattform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20desktop%20%26%20mobile-7c3aed)

> Englisch ist die kanonische Fassung: [README.md](https://github.com/johannes-kaindl/llm-lab/blob/main/README.md).

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/llm-lab/main/docs/images/hero.png" width="820" alt="Der Bewerten-Tab gefüllt mit vier Aufzeichnungen, gefiltert auf Nur unbewertete, eine Zeile ausgewählt mit vollem Prompt und Antwort darunter, und der Aktionsleiste Gut/Schlecht/Tags, Notiz, Korrektur hinzufügen/Aufzeichnung löschen"></p>

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
- **Es ist kein Datensatz-Browser und kein Export-Werkzeug.** Aufzeichnungen bewertest du in
  der Ansicht **LLM Lab**; die Bewertungen sammelt `dataset.jsonl`. Statistik und Export-Dialog
  sind noch nicht gebaut — was kommt, steht im Changelog.
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

### Aus dem Community-Plugin-Browser (empfohlen)

**Einstellungen → Community-Plugins → Durchsuchen**, nach **„LLM Lab"** suchen, **Installieren**,
dann **Aktivieren**. Aktualisierungen kommen wie bei jedem Community-Plugin.

### Aus einem Release

`main.js`, `manifest.json` und `styles.css` vom
[neuesten Release](https://github.com/johannes-kaindl/llm-lab/releases/latest) herunterladen,
nach `<vault>/.obsidian/plugins/llm-lab/` legen und das Plugin unter
**Einstellungen → Community-Plugins** aktivieren.

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

Die Aufzeichnung selbst braucht nichts zu starten und nichts zu klicken. Sobald ein
Nachbarplugin die API aufruft, läuft sie von selbst. Zum Sichten und Bewerten öffnest du den
Tab **LLM Lab** (Ribbon-Icon oder der Befehl „LLM Lab öffnen") — er listet die Aufrufe neueste
zuerst, zeigt zum ausgewählten den vollständigen Prompt samt Antwort und ist tastaturbedienbar:
`j`/`k` bewegen die Auswahl, `g`/`b` bewerten den aktuellen Aufruf gut/schlecht, `Enter` öffnet
Tags/Notiz/Korrektur, `Entf` löscht die Aufzeichnung. Darüber hinaus sind die einzigen drei
Dinge, die du je mit LLM Lab tust, diese:

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

<p align="center">
<a href="https://raw.githubusercontent.com/johannes-kaindl/llm-lab/main/docs/images/rate-empty.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/llm-lab/main/docs/images/thumbs/rate-empty.png" width="380" alt="Der Bewerten-Tab, bevor irgendeine Aufzeichnung angekommen ist: die Filterleiste über einer Leerzustands-Meldung, No recordings yet — LLM Lab only records what another plugin sends it, nothing has arrived so far"></a>
<a href="https://raw.githubusercontent.com/johannes-kaindl/llm-lab/main/docs/images/rate-details.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/llm-lab/main/docs/images/thumbs/rate-details.png" width="380" alt="Das Vertiefungs-Modal Add detail to this rating offen über einer Aufzeichnung: Tags, Note und die volle-Modalbreite-Textarea Better answer"></a>
</p>
<p align="center"><sub>Für die volle Größe auf eine Vorschau klicken — links: bevor irgendetwas aufgezeichnet wurde; rechts: Tags, eine Notiz oder eine Korrektur zu einer Bewertung hinzufügen</sub></p>

## Konfiguration

<img src="https://raw.githubusercontent.com/johannes-kaindl/llm-lab/main/docs/images/settings.png" width="820" alt="Der vollständige LLM-Lab-Einstellungen-Tab: LLM-Aufrufe mitschreiben, Traces aufbewahren, Maximale Trace-Größe, Diese Features nie mitschreiben, Notizen aus diesen Ordnern nie mitschreiben, Strenger Ordner-Ausschluss, Personenbezogenes auch im rohen Trace maskieren, Zusätzliche Begriffe maskieren, sowie die drei inhaltlich verbindlichen Hinweiszeilen Where the data is stored, What masking does and does not catch, What the folder filter can and cannot see">

| Einstellung | Standard | Wirkung |
|---|---|---|
| **LLM-Aufrufe mitschreiben** | an | Hauptschalter. Aus wird kein Trace geschrieben, egal wer die API aufruft. |
| **Traces aufbewahren (Tage)** | 7 | Ältere Trace-Dateien werden bei der Rotation gelöscht. Die heutige Datei nie. |
| **Maximale Trace-Größe (MB)** | 20 | Überschreiten die aufbewahrten Dateien diese Grenze, werden die ältesten zuerst gelöscht — die heutige ist ausgenommen. |
| **Diese Features nie mitschreiben** | `settings-probe` | Eine Feature-Kennung je Zeile. Der typische Fall sind die Verbindungstests eines aufrufenden Plugins — Verkehr, der keine echte Interaktion ist. |
| **Notizen aus diesen Ordnern nie mitschreiben** | *(leer)* | Ein Ordnerpfad je Zeile, Unterordner zählen mit. Ein Aufruf, in den eine Notiz daraus eingeflossen ist, wird nicht geschrieben. Greift nur bei Aufrufen, deren Plugin die beteiligten Notizen meldet. |
| **Strenger Ordner-Ausschluss** | an | An: eine einzige ausgeschlossene Notiz verhindert den ganzen Aufruf. Aus: der Aufruf entfällt nur, wenn ALLE beteiligten Notizen ausgeschlossen sind. |
| **Zusätzliche Begriffe maskieren** | *(leer)* | Ein Begriff je Zeile, zusätzlich zu den eingebauten Mustern für E-Mail/IBAN/Telefon/URL-Zugangsdaten — gleich maskiert, mit derselben Platzhalter-Konsistenz. Wirkt nur, solange der Schalter darüber an ist. |
| **Personenbezogenes auch im rohen Trace maskieren** | aus | Wendet die PII-Maskierung auch auf den rohen Trace an, nicht nur auf den bewerteten Datensatz. Standardmäßig aus, weil das Debuggen einer schlechten Antwort sehen muss, was wirklich gesendet wurde. |

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

**`apiVersion` steht auf `4`.** Sie gegen die eigene Konstante prüfen, bevor man sich auf die
Form verlässt — diese Versionsnummer ist der Vertrag, bewusst anstelle einer Build-Kopplung
zwischen zwei eigenständigen Repositories. Version 3 ergänzte `promptTemplate`, Version 4 `turnId`, zusätzlich zu
den beiden Feldern aus Version 2 — ein Konsument sollte alle füllen, die er kann:

- **`secrets?: string[]`** — die für diesen Aufruf verwendeten Endpunkt-Schlüssel. Sie dienen
  ausschließlich als Maskierungsliste und werden nie Teil des Records. Ohne sie werden nur
  wörtliche `Bearer`-Token erfasst.
- **`contextPaths?: string[]`** — die Vault-Pfade der Notizen, deren Inhalt in diesen Aufruf
  eingeflossen ist. Daran wird der Ordner-Ausschluss des Nutzers gemessen; ein Aufruf ohne
  Pfade wird immer mitgeschrieben.
- **`promptTemplate?: string`** — der stabile Anteil des System-Prompts: der Wortlaut, der eine
  Prompt-*Fassung* ausmacht, ohne Retrieval-Kontext und ohne Nutzereingabe. LLM Lab bildet
  daraus `promptTemplateHash`. Wer nichts meldet, bekommt keinen Hash — bewusst, denn ein Hash
  über einen System-Prompt mit Aufruf-Inhalt gruppiert nichts. Besteht der gemeldete Wortlaut
  aus übersetzten (i18n-)Bausteinen, ändert ein Wechsel der Obsidian-Oberflächensprache den
  Wortlaut mit — und damit auch den Hash, zu Recht als neue Fassung gezählt, denn der Wortlaut
  hat sich ja tatsächlich geändert.

- **`turnId?: string`** — eine Kennung, die alle Aufrufe einer einzelnen Nutzerhandlung teilen
  (etwa die mehreren Modellaufrufe eines Agent-Zugs). LLM Lab reicht sie unverändert durch,
  damit sich Aufzeichnungen später gruppieren lassen.

Der vollständige Vertrag und seine Begründung stehen in [`AGENTS.md`](https://github.com/johannes-kaindl/llm-lab/blob/main/AGENTS.md).

## Dokumentation

Die Anleitungen sind auf Englisch.

- [Dokumentations-Index](https://github.com/johannes-kaindl/llm-lab/blob/main/docs/README.md) — die Anleitungen, nach Diátaxis gegliedert.
- [Getting started](https://github.com/johannes-kaindl/llm-lab/blob/main/docs/getting-started.md) — von der Installation bis zur ersten bewerteten Aufzeichnung.
- [Troubleshooting](https://github.com/johannes-kaindl/llm-lab/blob/main/docs/troubleshooting.md) — was du siehst, was es bedeutet, was zu tun ist.
- [`CHANGELOG.md`](https://github.com/johannes-kaindl/llm-lab/blob/main/CHANGELOG.md) — Release-Notizen.
- [`SECURITY.md`](https://github.com/johannes-kaindl/llm-lab/blob/main/SECURITY.md) — wie man ein Sicherheitsproblem meldet.

## Mitwirken

Beiträge sind willkommen. Der Arbeitsablauf steht in [CONTRIBUTING.md](https://github.com/johannes-kaindl/llm-lab/blob/main/CONTRIBUTING.md)
(test-getrieben, `main` immer grün, Feature-Arbeit in `feat/<name>`, Conventional Commits),
Architektur und Modul-Konventionen in [AGENTS.md](https://github.com/johannes-kaindl/llm-lab/blob/main/AGENTS.md). Das kanonische Repository liegt
auf Forgejo (`git.jkaindl.de/jkaindl/llm-lab`); GitHub (`johannes-kaindl/llm-lab`) trägt die
Releases und Issues.

## Lizenz

- **Code:** [AGPL-3.0-or-later](https://github.com/johannes-kaindl/llm-lab/blob/main/LICENSE). Eine kommerzielle Zweitlizenz ist auf Anfrage verfügbar, falls das AGPL-Copyleft nicht zu deinem Anwendungsfall passt — siehe [`LICENSING.md`](https://github.com/johannes-kaindl/llm-lab/blob/main/LICENSING.md). Beiträge werden unter dem [Contributor License Agreement](https://github.com/johannes-kaindl/llm-lab/blob/main/CLA.md) angenommen.
- **Dokumentation und Texte:** [CC BY-SA 4.0](https://github.com/johannes-kaindl/llm-lab/blob/main/LICENSE-DOCS).

Copyright © 2026 Johannes Kaindl.
