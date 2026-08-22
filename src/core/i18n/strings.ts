import { defineStrings } from "../../vendor/kit/i18n";

export const STRINGS = {
  en: {
    "settings.enabled.name": "Record LLM calls",
    "settings.enabled.desc": "When off, nothing is written at all.",
    "settings.keepDays.name": "Keep traces for (days)",
    "settings.maxBytes.name": "Maximum trace size (MB)",
    "settings.excluded.name": "Never record these features",
    "settings.excluded.desc": "One feature key per line, e.g. settings-probe.",
    "settings.customPii.name": "Additional terms to mask",
    "settings.customPii.desc": "One per line. Replaced by a numbered placeholder.",
    "settings.redactTrace.name": "Mask personal data in raw traces too",
    "settings.redactTrace.desc": "Stricter, but debugging then no longer shows what was actually sent.",
    "settings.location.name": "Where the data is stored",
    "settings.location.desc": "{0} — inside your vault. Whether it is synced or backed up depends on your own settings.",
    "settings.redactionLimits": "Masking finds patterns: e-mail addresses, IBANs, phone numbers, credentials in URLs. It does not find names, addresses, diagnoses or relationships. The recording stays as confidential as your notes.",
    "status.recording": "Lab: recording",
    "status.paused": "Lab: paused",
    "command.togglePause": "LLM Lab: pause or resume recording",
  },
  de: {
    "settings.enabled.name": "LLM-Aufrufe mitschreiben",
    "settings.enabled.desc": "Ausgeschaltet wird gar nichts geschrieben.",
    "settings.keepDays.name": "Traces aufbewahren (Tage)",
    "settings.maxBytes.name": "Maximale Trace-Groesse (MB)",
    "settings.excluded.name": "Diese Features nie mitschreiben",
    "settings.excluded.desc": "Eine Feature-Kennung je Zeile, z. B. settings-probe.",
    "settings.customPii.name": "Zusaetzliche Begriffe maskieren",
    "settings.customPii.desc": "Einer je Zeile. Wird durch einen nummerierten Platzhalter ersetzt.",
    "settings.redactTrace.name": "Personenbezogenes auch im rohen Trace maskieren",
    "settings.redactTrace.desc": "Strenger, aber das Debugging zeigt dann nicht mehr, was wirklich gesendet wurde.",
    "settings.location.name": "Wo die Daten liegen",
    "settings.location.desc": "{0} — innerhalb deines Vaults. Ob der Ordner gesynct oder ins Backup aufgenommen wird, entscheidet deine eigene Konfiguration.",
    "settings.redactionLimits": "Die Maskierung findet Muster: E-Mail-Adressen, IBANs, Telefonnummern, Zugangsdaten in URLs. Sie findet keine Namen, Adressen, Diagnosen oder Beziehungen. Die Aufzeichnung bleibt so vertraulich wie deine Notizen.",
    "status.recording": "Lab: schreibt mit",
    "status.paused": "Lab: pausiert",
    "command.togglePause": "LLM Lab: Mitschreiben pausieren oder fortsetzen",
  },
} as const;

defineStrings(STRINGS);
