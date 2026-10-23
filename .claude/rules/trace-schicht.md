---
paths:
  - "src/core/trace_store.ts"
  - "src/core/trace_reader.ts"
  - "src/core/rotation.ts"
  - "src/core/dataset.ts"
  - "src/core/dataset_store.ts"
  - "src/obsidian/vault_sink.ts"
  - "tests/core/trace_store.test.ts"
  - "tests/core/trace_reader.test.ts"
  - "tests/core/rotation.test.ts"
  - "tests/core/dataset_store.test.ts"
---

# Trace-Schicht — Schreiben, Rotieren, Entfernen

Gotchas zum Ablegen der Records: Sink, Promise-Kette, Rotation.

- **`vaultSink.list` liefert eine leere Liste, wenn der Ordner noch nicht existiert** (statt zu werfen) — `planRotation` bekommt dann `[]` und tut nichts, was für den allerersten Schreibvorgang korrekt ist (kein Ordner, keine Dateien zum Rotieren).

- **Alle verändernden Zugriffe auf die Trace-Schicht laufen über EINE Promise-Kette** (`TraceStore.serialize`). Bis 2026-09-03 gab es keine: `write()` rief `void this.writeNow(...)` direkt, zwei gleichzeitige Aufrufe überlappten einander samt der `rotate()` dahinter. Mit dem zeilenweisen Entfernen (`removeRecord`) wäre daraus stiller Datenverlust geworden — ein `append` zwischen `read` und `write` wird überschrieben. **`write()` bleibt fire-and-forget:** die Kette ändert nichts an der Zusage, dass Telemetrie den Aufrufer nie bremst. Wer eine neue verändernde Operation ergänzt, hängt sie in die Kette — und ruft **nie** `rotate()` aus einem Job heraus auf (Selbst-Deadlock), sondern `rotateNow()`.
