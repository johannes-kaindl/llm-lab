# Fixture — der Aufnahme-/Prüf-Vault

Aus diesem Ordner baut `npm run smoke:gui -- --setup` einen eigenständigen Obsidian-Vault
(`$STAGING_VAULTS_DIR/llm-lab`). Er ist **Wegwerfware**: sein Inhalt kommt vollständig von
hier, geht er verloren, ist der nächste Lauf trotzdem reproduzierbar.

```
notes/      Kulisse — generische englische Notizen, kein Personenbezug
obsidian/   Vault-Konfiguration: NUR llm-lab aktiv, helles Theme, keine Inline-Titel
```

Warum ein eigener Vault statt des Arbeits-Vaults: **Kreuzkontamination** (fremde Plugins
schreiben und zeichnen mit) und **Determinismus** (Theme und aktive Plugins liegen in der
vault-eigenen `.obsidian/`, nicht in der Laune des Augenblicks). Der Arbeits-Vault scheidet
zusätzlich aus, weil dort der Plugin-Ordner ein Symlink aufs Repo sein kann — dann prüft man
nie den Weg, den eine echte Erstinstallation nimmt.

Genutzt wird das Fixture heute vom GUI-Smoke (`scripts/gui-smoke.ts`, s. `docs/SMOKE.md`).
Der Ort ist trotzdem `docs/images/fixture/`: es ist der workspace-weite Ort für Fixture-Vaults
(Skill `readme-shots`), und eine spätere README-Bebilderung nimmt dieselbe Kulisse, statt eine
zweite anzulegen.

**Beispieldaten bleiben generisch und englisch.** Alles, was hier steht, kann in einem Bild
landen und mit dem Repo um die Welt gehen: keine echten Personen, Firmen, Nummern, Adressen —
auch nicht die des Maintainers. `README.md` ist die kanonische Fassung, deshalb Englisch.
