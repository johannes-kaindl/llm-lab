// Minimaler Obsidian-Mock nach dem Skill-Pattern `obsidian-plugin-test-pattern`
// (lazy add-on-demand: nur, was ein Test tatsaechlich braucht — kein Voraus-Nachbau der
// kompletten API). Ueber `resolve.alias` in vitest.config.ts an "obsidian" gebunden;
// tsc sieht diese Datei nie ueber den Alias, sondern typprueft `src/` gegen das echte
// npm-Paket — die beiden muessen sich deshalb nur zur LAUFZEIT vertragen, nicht im Typ.
//
// Bewusst KEIN echtes DOM (kein jsdom/happy-dom-Dependency): `createDiv`/`createEl` liefern
// reine Objekt-Stubs. rate_panel.ts liest den DOM-Zustand nie zurueck (UI-STANDARD §4: DOM
// ist reine Funktion des gehaltenen Zustands) — ein Stub, der nur Kinder sammelt und
// Event-Handler als Property haelt, reicht deshalb aus.

export function makeFakeEl(): any {
  const children: any[] = [];
  const el: any = {
    tagName: "DIV",
    className: "",
    textContent: "",
    children,
    attrs: {} as Record<string, string>,
    value: "",
    disabled: false,
    onclick: null,
    onchange: null,
    createDiv(opts?: { cls?: string; text?: string; attr?: Record<string, string> }): any {
      const child = makeFakeEl();
      children.push(child);
      if (opts?.cls) child.className = opts.cls;
      if (opts?.text !== undefined) child.textContent = opts.text;
      if (opts?.attr) Object.assign(child.attrs, opts.attr);
      return child;
    },
    createSpan(opts?: { cls?: string; text?: string }): any {
      const child = makeFakeEl();
      children.push(child);
      child.tagName = "SPAN";
      if (opts?.cls) child.className = opts.cls;
      if (opts?.text !== undefined) child.textContent = opts.text;
      return child;
    },
    createEl(tag: string, opts?: { cls?: string; text?: string; value?: string }): any {
      const child = makeFakeEl();
      children.push(child);
      child.tagName = tag.toUpperCase();
      if (opts?.cls) child.className = opts.cls;
      if (opts?.text !== undefined) child.textContent = opts.text;
      if (opts?.value !== undefined) child.value = opts.value;
      return child;
    },
    empty(): void {
      children.length = 0;
    },
    addEventListener(): void {
      // no-op — Tests rufen die private Tastenlogik nicht ueber echte DOM-Events auf.
    },
    focus(): void {
      // no-op
    },
    setText(text: string): void {
      el.textContent = text;
    },
    setAttr(name: string, value: string): void {
      el.attrs[name] = value;
    },
    toggleClass(cls: string, an: boolean): void {
      const teile = new Set((el.className || "").split(" ").filter(Boolean));
      if (an) teile.add(cls);
      else teile.delete(cls);
      el.className = [...teile].join(" ");
    },
    addClass(cls: string): void {
      el.toggleClass(cls, true);
    },
    removeClass(cls: string): void {
      el.toggleClass(cls, false);
    },
    appendChild(child: any): void {
      children.push(child);
    },
  };
  return el;
}

export function setIcon(_el: unknown, _icon: string): void {
  // no-op — die Icon-Bibliothek existiert im Test nicht.
}

export class Modal {
  app: any;
  contentEl: any;
  titleEl: any;
  containerEl: any;
  private geschlossen = false;

  constructor(app: any) {
    this.app = app;
    this.contentEl = makeFakeEl();
    this.titleEl = makeFakeEl();
    this.containerEl = makeFakeEl();
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    if (this.geschlossen) return;
    this.geschlossen = true;
    this.onClose();
  }

  onOpen(): void {
    // Override in Subklasse.
  }

  onClose(): void {
    // Override in Subklasse.
  }
}

/** Minimaler Stub — im Test nie geoeffnet (RateDetailsModal wird von den I1/I4-Tests nicht
 *  durchlaufen), muss nur als Klasse existieren, damit `rate_details_modal.ts` importierbar
 *  bleibt (Lazy add-on-demand: erweitern, sobald ein Test sie wirklich braucht). */
export class Setting {
  constructor(_containerEl: unknown) {}
  setName(): this { return this; }
  setDesc(): this { return this; }
  addText(_cb?: (c: unknown) => void): this { return this; }
  addTextArea(_cb?: (c: unknown) => void): this { return this; }
  addButton(_cb?: (c: unknown) => void): this { return this; }
}

export class ButtonComponent {
  buttonEl: any;

  constructor(containerEl: any) {
    this.buttonEl = containerEl.createEl("button");
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  onClick(fn: () => void): this {
    this.buttonEl.onclick = fn;
    return this;
  }

  setCta(): this {
    this.buttonEl.addClass("mod-cta");
    return this;
  }

  setWarning(): this {
    this.buttonEl.addClass("mod-warning");
    return this;
  }
}

/** Jede erzeugte Notice landet zusaetzlich in `noticeLog` — ein Test prueft damit, OB und
 *  MIT WELCHEM Text eine Notice erschien, ohne den DOM/Popup-Mechanismus nachzubauen.
 *  `resetNoticeLog()` gehoert in `beforeEach`, sonst haeufen sich Notices ueber Tests. */
export const noticeLog: string[] = [];

export function resetNoticeLog(): void {
  noticeLog.length = 0;
}

export class Notice {
  constructor(
    public message: string,
    public timeout?: number,
  ) {
    noticeLog.push(message);
  }
}

// Kein `App`-Runtime-Export noetig: `type App` wird als Type-only-Import erasable
// (isolatedModules) und existiert im kompilierten Test-Code nicht.
