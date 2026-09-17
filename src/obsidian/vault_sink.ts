import type { DataAdapter } from "obsidian";
import type { TraceSink } from "../core/trace_store";
import type { TraceFile } from "../core/rotation";

/** Verzeichnis eines Pfades. Befund M10: `path.slice(0, path.lastIndexOf("/"))` traegt
 *  eine unausgesprochene Annahme — ohne Schraegstrich liefert `lastIndexOf` `-1`, und
 *  `slice(0, -1)` kappt dann das letzte ZEICHEN statt ein leeres Verzeichnis zu ergeben.
 *  Heute unerreichbar (jeder Pfad traegt das Plugin-Basisverzeichnis), aber die Annahme
 *  gehoert explizit hierher, nicht implizit in eine Zeichenketten-Arithmetik. */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Duenne Anpassung von Obsidians DataAdapter an den TraceSink-Port.
 *  Legt den Ordner beim ersten Schreiben an — `append` allein tut das nicht. */
export function vaultSink(adapter: DataAdapter): TraceSink {
  return {
    async append(path, data) {
      const dir = dirOf(path);
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.append(path, data);
    },
    async list(dir): Promise<TraceFile[]> {
      if (!(await adapter.exists(dir))) return [];
      const listing = await adapter.list(dir);
      const files: TraceFile[] = [];
      for (const full of listing.files) {
        const stat = await adapter.stat(full);
        files.push({ name: full.slice(full.lastIndexOf("/") + 1), bytes: stat?.size ?? 0 });
      }
      return files;
    },
    async read(path) {
      if (!(await adapter.exists(path))) return "";
      return adapter.read(path);
    },
    async write(path, data) {
      const dir = dirOf(path);
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(path, data);
    },
    async remove(path) {
      await adapter.remove(path);
    },
  };
}
