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
    // STORE-SCHULD: minAppVersion 1.8.7 ist NICHT der Grund fuer den Override — vault-rag
    // steht ebenfalls unter der 1.13-Schwelle (minAppVersion 1.12.7) und faehrt die
    // deklarative API trotzdem zweigleisig (settings.ts: display() faellt auf
    // renderImperative() zurueck). Die ehrliche Begruendung: sechs Settings-Zeilen in
    // Slice 1 lohnen den Zweigleisig-Umbau schlicht noch nicht. Abloesung: sobald eine
    // spaetere Slice die Settings-Tab-Zeilenzahl spuerbar erhoeht (eigene Entscheidung,
    // kein Task in Slice 1), zieht LabSettingTab auf getSettingDefinitions() um, nach dem
    // Zweigleisig-Muster aus vault-rag.
    files: ["src/obsidian/settings_tab.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
];
