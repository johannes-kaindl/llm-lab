import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "../vendor/kit/i18n";
import type LlmLabPlugin from "../main";

const BYTES_PER_MB = 1024 * 1024;

/** Textarea → Zeilenliste: eine Kennung/ein Begriff je Zeile, Leerzeilen und
 *  Randweissraum weg. Umkehrung von `list.join("\n")` beim Anzeigen. */
function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export class LabSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: LlmLabPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("settings.enabled.name"))
      .setDesc(t("settings.enabled.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName(t("settings.keepDays.name")).addText((text) =>
      text.setValue(String(this.plugin.settings.keepDays)).onChange(async (value) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return;
        this.plugin.settings.keepDays = n;
        await this.plugin.saveSettings();
      }),
    );

    new Setting(containerEl).setName(t("settings.maxBytes.name")).addText((text) =>
      text
        .setValue(String(this.plugin.settings.maxBytes / BYTES_PER_MB))
        .onChange(async (value) => {
          const n = Number(value);
          if (!Number.isFinite(n) || n <= 0) return;
          this.plugin.settings.maxBytes = n * BYTES_PER_MB;
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl)
      .setName(t("settings.excluded.name"))
      .setDesc(t("settings.excluded.desc"))
      .addTextArea((area) =>
        area
          .setValue(this.plugin.settings.excludedFeatures.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedFeatures = parseLines(value);
            await this.plugin.saveSettings();
          }),
      );

    // Muss VOR customPiiTerms gezeichnet werden: es ist der einzige Aktivator dieses
    // Felds (WriteOptions.piiTerms wirkt nur mit redactPii:true) und ist per Default aus —
    // sonst tippt jemand einen Klientennamen ins Feld darunter und bekommt weder Maskierung
    // noch einen Hinweis, dass gerade nichts maskiert wird (falsches Sicherheitsgefuehl).
    new Setting(containerEl)
      .setName(t("settings.redactTrace.name"))
      .setDesc(t("settings.redactTrace.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.redactPiiInTrace).onChange(async (value) => {
          this.plugin.settings.redactPiiInTrace = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settings.customPii.name"))
      .setDesc(t("settings.customPii.desc"))
      .addTextArea((area) =>
        area
          .setValue(this.plugin.settings.customPiiTerms.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.customPiiTerms = parseLines(value);
            await this.plugin.saveSettings();
          }),
      );

    // Inhaltlich verbindlich: sagt, WO die Daten liegen (im Vault, Sync/Backup ist
    // Sache der eigenen Konfiguration) — kein Nebensatz, eine eigene Zeile.
    new Setting(containerEl)
      .setName(t("settings.location.name"))
      .setDesc(
        t(
          "settings.location.desc",
          this.plugin.manifest.dir ?? `.obsidian/plugins/${this.plugin.manifest.id}`,
        ),
      );

    // Inhaltlich verbindlich: was die Maskierung findet UND was nicht — soll keine
    // falsche Sicherheit erzeugen, deshalb sichtbar im Tab statt in einer Beschreibung
    // untergemischt.
    containerEl.createEl("p", {
      text: t("settings.redactionLimits"),
      cls: "setting-item-description",
    });
  }
}
