// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
export default [
  {
    // Type-aware Linting braucht das Build-tsconfig des Repos. Achtung Falle
    // (json_viewer 1.9.0): ein obsidian→Mock-paths-Alias im referenzierten tsconfig
    // laesst die type-aware Regeln auf einen losen Mock aufloesen → no-unsafe-*-Kaskade.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // STORE-SCHULD: minAppVersion ist 1.8.7 (vor der 1.13-Catalyst-Preview, die
    // getSettingDefinitions() ueberhaupt erst liest) — die deklarative API waere hier
    // totes Gewicht ohne Wirkung. Abloesung: sobald minAppVersion auf 1.13+ angehoben
    // wird (eigene Entscheidung, kein Task in Slice 1), zieht LabSettingTab auf
    // getSettingDefinitions() um, nach dem Zweigleisig-Muster aus vault-rag
    // (settings.ts: display() faellt auf renderImperative() zurueck).
    files: ["src/obsidian/settings_tab.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
];
