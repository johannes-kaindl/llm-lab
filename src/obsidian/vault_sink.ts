import type { DataAdapter } from "obsidian";
import type { TraceSink } from "../core/trace_store";
import type { TraceFile } from "../core/rotation";

/** Duenne Anpassung von Obsidians DataAdapter an den TraceSink-Port.
 *  Legt den Ordner beim ersten Schreiben an — `append` allein tut das nicht. */
export function vaultSink(adapter: DataAdapter): TraceSink {
  return {
    async append(path, data) {
      const dir = path.slice(0, path.lastIndexOf("/"));
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
      const dir = path.slice(0, path.lastIndexOf("/"));
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(path, data);
    },
    async remove(path) {
      await adapter.remove(path);
    },
  };
}
