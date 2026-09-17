import { Modal, Setting, type App } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import type { RateInput, Verdict } from "../../core/dataset";

/** Vertiefung zu einem Urteil. Loest mit `null` auf, wenn abgebrochen wird —
 *  ein abgebrochener Dialog darf keine halbe Bewertung schreiben. */
export class RateDetailsModal extends Modal {
  private tags = "";
  private note = "";
  private correction = "";
  private ergebnis: RateInput | null = null;

  constructor(
    app: App,
    private readonly verdict: Verdict,
    private readonly onDone: (r: RateInput | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t("details.title"));

    new Setting(this.contentEl)
      .setName(t("details.tags.name"))
      .setDesc(t("details.tags.desc"))
      .addText((c) => c.onChange((v) => { this.tags = v; }));

    new Setting(this.contentEl)
      .setName(t("details.note.name"))
      .addText((c) => c.onChange((v) => { this.note = v; }));

    // Volle Modalbreite statt der schmalen Setting-Control-Spalte: "Bessere Antwort" ist
    // der wertvollste Teil des Datensatzes (SFT-Korrektur) und braucht Platz fuer
    // Mehrzeiler. `setClass` stapelt Name/Desc ueber den Control-Block (styles.css), die
    // Zeile bleibt trotzdem eine native `Setting` (UI-STANDARD §8: kein Baustein fuer
    // diese Form katalogisiert, die naechste verwandte Grammatik ist die vertikale
    // Listen-Zeile — Name/Desc/Inhalt untereinander statt nebeneinander).
    new Setting(this.contentEl)
      .setClass("llm-lab-correction-setting")
      .setName(t("details.correction.name"))
      .setDesc(t("details.correction.desc"))
      .addTextArea((c) => {
        c.onChange((v) => { this.correction = v; });
        c.inputEl.rows = 6;
      });

    // Cancel links, Bestaetigen rechts (UI-STANDARD §8, Confirm-Modal-Grammatik).
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("details.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText(t("details.save")).setCta().onClick(() => {
          this.ergebnis = {
            verdict: this.verdict,
            tags: this.tags.split(",").map((x) => x.trim()).filter(Boolean),
            note: this.note,
            correction: this.correction,
          };
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDone(this.ergebnis);
  }
}
