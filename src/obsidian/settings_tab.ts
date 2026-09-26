import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { t } from "../vendor/kit/i18n";
import {
  renderSettingDefinitions,
  type SettingControlHost,
} from "../vendor/kit-obsidian/settings_walker";
import { githubHelpUrls, helpSettingDefinition } from "../vendor/kit-obsidian/help-setting";
import type { LabSettings } from "../core/settings";
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

/** Eine positive, endliche Zahl — die Bedingung, unter der `keepDays`/`maxBytes`
 *  ueberhaupt sinnvoll sind (0 Tage hiesse „sofort loeschen", negativ ist unsinnig). */
function isPositiveNumber(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Zweigleisiger Settings-Tab (REGISTRY „Zweigleisige deklarative Settings").
 *
 * `getSettingDefinitions()` IST die Struktur — Obsidian >= 1.13 rendert daraus selbst
 * und nimmt die Zeilen in seine Einstellungs-Suche auf. Darunter ruft der Host
 * `display()`, das DIESELBE Definitionsliste mit der klassischen Setting-API
 * nachzeichnet (Kit-Walker). Es gibt bewusst keinen zweiten Definitionsbaum: was hier
 * nicht in `getSettingDefinitions()` steht, existiert in keinem der beiden Pfade.
 *
 * `minAppVersion` muss dafuer NICHT steigen — der Fallback bedient 1.8.7 weiter.
 */
export class LabSettingTab extends PluginSettingTab implements SettingControlHost {
  constructor(
    app: App,
    private readonly plugin: LlmLabPlugin,
  ) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    const s = this.plugin.settings;
    switch (key as keyof LabSettings) {
      case "enabled":
        return s.enabled;
      case "keepDays":
        return s.keepDays;
      // Gespeichert wird in Bytes, angezeigt in MB — die Zeile heisst „(MB)".
      case "maxBytes":
        return s.maxBytes / BYTES_PER_MB;
      case "excludedFeatures":
        return s.excludedFeatures.join("\n");
      case "excludedFolders":
        return s.excludedFolders.join("\n");
      case "strictFolderExclusion":
        return s.strictFolderExclusion;
      case "redactPiiInTrace":
        return s.redactPiiInTrace;
      case "customPiiTerms":
        return s.customPiiTerms.join("\n");
      default:
        return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings;
    switch (key as keyof LabSettings) {
      case "enabled":
        s.enabled = Boolean(value);
        break;
      // Die Zahl-Pruefung steht HIER und nicht nur in `validate`: `validate` wertet
      // allein der native 1.13-Renderer aus, der Fallback-Walker kennt es nicht.
      // Ohne diese Wache schriebe der Fallback-Pfad `NaN` in die Einstellungen.
      case "keepDays":
        if (!isPositiveNumber(value)) return;
        s.keepDays = Number(value);
        break;
      case "maxBytes":
        if (!isPositiveNumber(value)) return;
        s.maxBytes = Number(value) * BYTES_PER_MB;
        break;
      case "excludedFeatures":
        s.excludedFeatures = parseLines(String(value));
        break;
      case "excludedFolders":
        s.excludedFolders = parseLines(String(value));
        break;
      case "strictFolderExclusion":
        s.strictFolderExclusion = Boolean(value);
        break;
      case "redactPiiInTrace":
        s.redactPiiInTrace = Boolean(value);
        break;
      case "customPiiTerms":
        s.customPiiTerms = parseLines(String(value));
        break;
      default:
        return;
    }
    await this.plugin.saveSettings();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const positive = (v: number): string | void =>
      isPositiveNumber(v) ? undefined : t("settings.positiveNumber");

    return [
      // UI-STANDARD §8 „Hilfe-Zeile": als erstes Element, vor jeder Überschrift.
      helpSettingDefinition({
        ...githubHelpUrls("llm-lab"),
        texts: {
          name: t("help.name"),
          desc: t("help.desc"),
          openDocs: t("help.openDocs"),
          reportIssue: t("help.reportIssue"),
        },
      }),
      {
        name: t("settings.enabled.name"),
        desc: t("settings.enabled.desc"),
        control: { type: "toggle", key: "enabled" },
      },
      {
        name: t("settings.keepDays.name"),
        control: { type: "number", key: "keepDays", validate: positive },
      },
      {
        name: t("settings.maxBytes.name"),
        control: { type: "number", key: "maxBytes", validate: positive },
      },
      {
        name: t("settings.excluded.name"),
        desc: t("settings.excluded.desc"),
        control: { type: "textarea", key: "excludedFeatures" },
      },
      {
        name: t("settings.excludedFolders.name"),
        desc: t("settings.excludedFolders.desc"),
        control: { type: "textarea", key: "excludedFolders" },
      },
      // Steht UNTER der Liste, nicht darueber: dieser Schalter ist ihr Modifikator,
      // nicht ihr Aktivator — anders als redactPiiInTrace, das VOR customPiiTerms
      // stehen muss, weil es dessen einziger Aktivator ist.
      {
        name: t("settings.strictFolders.name"),
        desc: t("settings.strictFolders.desc"),
        control: { type: "toggle", key: "strictFolderExclusion" },
      },
      // Muss VOR customPiiTerms stehen: es ist der einzige Aktivator dieses Felds
      // (WriteOptions.piiTerms wirkt nur mit redactPii:true) und ist per Default aus —
      // sonst tippt jemand einen Klientennamen ins Feld darunter und bekommt weder
      // Maskierung noch einen Hinweis, dass gerade nichts maskiert wird.
      {
        name: t("settings.redactTrace.name"),
        desc: t("settings.redactTrace.desc"),
        control: { type: "toggle", key: "redactPiiInTrace" },
      },
      {
        name: t("settings.customPii.name"),
        desc: t("settings.customPii.desc"),
        control: { type: "textarea", key: "customPiiTerms" },
      },
      // Die beiden folgenden Zeilen tragen KEINEN Regler und sind trotzdem als
      // `render`-Hatch gebaut, nicht als reine name/desc-Definition: eine Zeile ohne
      // Control ueberspringt der native 1.13-Renderer stillschweigend, waehrend der
      // Fallback-Walker sie zeichnet — die beiden Pfade zeigten dann Verschiedenes.
      // Eine Zeile ohne Regler braucht im deklarativen Modell trotzdem einen Renderer.
      // (Belegt an yijing-oracle 2026-08-16, REGISTRY „eine-Wahrheit-Walker".)
      //
      // Inhaltlich verbindlich: sagt, WO die Daten liegen (im Vault, Sync/Backup ist
      // Sache der eigenen Konfiguration) — kein Nebensatz, eine eigene Zeile.
      {
        name: t("settings.location.name"),
        render: (setting) => {
          setting.setDesc(
            t(
              "settings.location.desc",
              this.plugin.manifest.dir ?? `.obsidian/plugins/${this.plugin.manifest.id}`,
            ),
          );
        },
      },
      // Inhaltlich verbindlich: was die Maskierung findet UND was nicht — soll keine
      // falsche Sicherheit erzeugen, deshalb sichtbar im Tab statt in einer
      // Beschreibung untergemischt.
      // Die Zeile trug bis 2026-08-23 gar keine Ueberschrift (ein blosses <p>). Das
      // deklarative Modell verlangt einen `name` — was hier ein Gewinn ist: mit
      // Ueberschrift ist der Hinweis ab 1.13 auch ueber die Einstellungs-Suche zu finden.
      {
        name: t("settings.redactionLimits.name"),
        render: (setting) => {
          setting.setDesc(t("settings.redactionLimits"));
        },
      },
      // Dritte inhaltlich verbindliche Zeile, gleiche Bauart wie die beiden darueber:
      // benennt die GRENZE des Ordner-Filters. Er greift nur bei Aufrufen, deren
      // Plugin Pfade meldet — wer das nicht weiss, haelt den Ausschluss fuer eine
      // Zusage ueber alle Plugins hinweg.
      {
        name: t("settings.folderFilterLimits.name"),
        render: (setting) => {
          setting.setDesc(t("settings.folderFilterLimits"));
        },
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    renderSettingDefinitions(containerEl, this.getSettingDefinitions(), this, this.app);
  }
}
