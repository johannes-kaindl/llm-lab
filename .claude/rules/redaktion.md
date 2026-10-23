---
paths:
  - "src/core/redact_pii.ts"
  - "src/core/trace_store.ts"
  - "src/core/record.ts"
  - "tests/core/redact_pii.test.ts"
  - "tests/core/redact_secrets.test.ts"
  - "tests/core/trace_store.test.ts"
  - "tests/core/record.test.ts"
---

# Redaktion — Schlüssel zuerst, dann PII

Regeln zur Maskierung vor dem Schreiben. Die Schlüssel-Maskierung kommt aus code-kit `redact` (`src/vendor/kit/redact.ts`: `redactKeysInValue` wirft fail-closed, `createPiiRedactor` maskiert PII mit record-weiten Platzhaltern); `redact_pii.ts` ist der dünne Mantel um den Kit-Redaktor.

## Zwei Läufe, eine feste Reihenfolge

Zwei Maskierungsläufe, **niemals in der anderen Reihenfolge**:

1. **Schlüssel-Maskierung (`redactKeysInValue` (Kit `redact`)) LÄUFT IMMER, ohne Einstellung — und hat seit `apiVersion` 2 auch etwas zu vergleichen.** Der exakte-String-Ersetzungslauf bekommt die **Vereinigung** zweier Listen: `deps.secrets()` (die Lab-eigene Liste — sie ist weiterhin leer, `main.ts` verdrahtet unverändert `secrets: () => []`, und sie ist die Stelle, an der später eine im Lab konfigurierte Liste andockt) und `input.secrets` (die Schlüssel, die der Konsument bei DIESEM Aufruf mitgibt). `log()` trennt das Feld explizit heraus, bevor `buildTraceRecord` läuft — ein Schlüssel wird nur zum Maskieren benutzt und wandert nie in den Record. Zusätzlich greift weiterhin das fest einprogrammierte `BEARER`-Muster auf Token, die wörtlich in `Bearer <token>`-Form im Text auftauchen. **Die Zusage bleibt trotzdem an eine Bedingung geknüpft:** ein Konsument, der `secrets` nicht befüllt, bekommt genau wie vorher nur das `BEARER`-Muster — der Mechanismus läuft unbedingt, das Ergebnis hängt am Aufrufer. API-Schlüssel und Bearer-Echos sind kein Inhalt und kein Zweck der Erhebung — sie gehören in keine der beiden Schichten, roh oder redigiert; das ist die Begründung dafür, WARUM diese Maskierung unbedingt läuft.

2. **PII-Redaktion (`redactPii`) läuft NUR über die Textfelder** (`messages[].content`, `response.content`, `response.reasoning`, `error`) und **nur wenn `redactPiiInTrace` gesetzt ist** (Default: aus). PII *ist* der Inhalt und damit der Zweck der Erhebung — das Debugging einer schlechten Antwort braucht, was wirklich gesendet wurde. Die Asymmetrie zu Punkt 1 ist beabsichtigt und hier dokumentiert, sonst hält sie später jemand für eine Lücke und „repariert" sie in die falsche Richtung.

**Warum genau diese Reihenfolge und keine andere:** `redactPii`s `PHONE`-Muster ist ein blanker Ziffernlauf und trifft dabei auch die Ziffernfolge INNERHALB eines API-Schlüssels. Liefe die PII-Redaktion zuerst, zerrisse sie den Schlüssel in Fragmente — die anschließende exakte String-Suche der Schlüssel-Maskierung fände das Original-Literal danach nicht mehr, und die Fragmente landeten ungeschwärzt auf der Platte. Umgekehrt ist unbedenklich: eine Muster-Ersetzung zerreißt nichts, was noch geschwärzt werden müsste — nichts, was die Schlüssel-Maskierung erzeugt (`••••`, `Bearer ••••`), matcht EMAIL/IBAN/PHONE/URLCRED. Die Regel dahinter: **wer exakt matcht, muss laufen, bevor wer Muster umschreibt.**

**Was die erste Abnahme gegen einen echten Konsumenten über das Feldset ergeben hat — und wie es aufgelöst wurde.** `systemPromptHash` trennte auf vault-rags Chat-Pfad **keine Prompt-Fassungen, sondern Aufrufe**: der Retrieval-Kontext steckt dort in der System-Nachricht, also änderte sich der Hash mit jeder Frage (gemessen 2026-08-23). Beim Entwurf der Korrektur zeigte die Nachmessung über alle vier Trace-Pfade, dass es kein Chat-Sonderfall war — `reformat:freetext` trägt die Nutzer-Anweisung im System-Prompt und hatte denselben Defekt, während `reformat:to-list` und `smart-apply` stabil waren. **Ein Feld, dessen Bedeutung vom aufrufenden Pfad abhängt, war das Problem — nicht ein kaputter Hash.** Seit `apiVersion` 3 meldet der Konsument den stabilen Anteil selbst (`promptTemplate`), und ohne Meldung entsteht gar kein Hash. Messwerte in `docs/SMOKE.md` § Konsumenten-Abnahme.

`TraceStore.writeNow` (`src/core/trace_store.ts`) ist die einzige Stelle, an der beide Läufe zusammengeführt werden — genau in dieser Reihenfolge, mit einem Kommentar-Block, der sie begründet, damit ein künftiger Refactor sie nicht aus Versehen vertauscht.

**Die PII-Redaktion ist record-weit konsistent, nicht feldweise.** Der Platzhalter-Zähler (`Map<string, string>` je Muster-Label) wird EINMAL pro Record aufgebaut und über `messages[]`, `response.content`, `response.reasoning` und `error` hinweg geteilt — dieselbe Adresse bekommt in Prompt UND Antwort denselben Platzhalter. Eine feldweise Zählung würde bei jedem Feld neu bei `_1` anfangen; ein aus solchen Daten trainiertes Modell lernt daraus, aus einem Platzhalter beliebige neue Daten zu erfinden, statt die Aufgabenstruktur zu lernen. Das ist die eigentliche Referenzleistung dieses Moduls (`src/core/redact_pii.ts`) — s. `REGISTRY.md` im Dach.

- **`redactKeysInValue` (Kit `redact`)/`redactPii` arbeiten über die Serialisierung** (`JSON.stringify`/`JSON.parse` bzw. Feld-für-Feld-Rekonstruktion), nicht über eine Liste zu pflegender Felder — eine Feldliste wäre genau die Buchhaltung, die beim nächsten neuen `TraceRecord`-Feld still veraltet. `redactKeysInValue` (Kit `redact`) wirft dementsprechend auf nicht-serialisierbarem Input; das ist beabsichtigt und fail-closed (`TraceStore.writeNow` fängt den Fehler, sodass nie ein Geheimnis ungeschwärzt geschrieben wird).
