---
paths:
  - "src/obsidian/settings_tab.ts"
  - "tests/obsidian/settings_tab.test.ts"
  - "scripts/gui-smoke.ts"
---

# Settings-Tab — zwei Gleise

Gotchas zum Einstellungs-Tab (deklarativ ab Obsidian 1.13, Kit-Walker darunter).

**Zwei Regeln, die beim Anfassen des Settings-Tabs gelten** (beide gemessen, nicht vermutet):

1. **Eine Zeile ohne Regler braucht im deklarativen Modell trotzdem einen Renderer.** Eine reine name/desc-Definition überspringt der native 1.13-Renderer stillschweigend, während der Fallback-Walker sie zeichnet — die beiden Pfade zeigten dann Verschiedenes, und unter 1.13 fiele es nie auf. Deshalb sind Ablageort, Maskierungs-Grenzen und die Grenze des Ordner-Filters `render`-Hatches. Prüfpunkt 23 im GUI-Smoke bewacht genau das.

2. **Die Wertprüfung gehört in `setControlValue`, nicht nur in `validate`.** `validate` wertet allein der native Renderer aus; der Kit-Walker kennt es nicht. Ohne die Wache im Host schriebe der Fallback-Pfad `NaN` in die Einstellungen (Prüfpunkt 25).

**`minAppVersion` musste dafür NICHT steigen** — sie steht weiter auf 1.8.7, der Fallback bedient alles darunter. Die frühere Stundung dieses Umbaus („1.13-API, unsere Nutzer sind darunter") war in genau diesem Punkt falsch.
