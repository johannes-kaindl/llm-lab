# Getting started

This walk-through takes you from a fresh install to a recorded LLM call that you rate. It needs about ten minutes. LLM Lab records what *other* plugins send to a model — so for the first recording you either use such a plugin (for example [vault-rag](https://github.com/johannes-kaindl/vault-rag)) or play one yourself, as in step 3.

## 1. Install and enable the plugin

Follow one of the [install routes in the README](https://github.com/johannes-kaindl/llm-lab/blob/main/README.md#install), then enable **LLM Lab** under **Settings → Community plugins**.

## 2. Check that it is recording

Look at the status bar. It reads **Lab: recording** with a dot icon. **Lab: paused** with a pause icon means recording is off for this session; run the command **LLM Lab: pause or resume recording** to switch it back.

Click the flask icon in the ribbon, or run **Open LLM Lab**. The **Rate** tab opens and says:

> No recordings yet. LLM Lab only records what another plugin sends it — nothing has arrived so far.

That is correct: nothing has called it yet.

## 3. Record a first call

Use any plugin that reports to LLM Lab and let it ask a model something. If you have none yet, play the consumer yourself: open the developer console (<kbd>Cmd/Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>) and run

```js
app.plugins.plugins["llm-lab"].api.log({
  plugin: "my-test", feature: "chat", model: "demo-model",
  endpointUrl: "http://127.0.0.1:1234",
  messages: [{ role: "user", content: "Say hello." }],
  content: "Hello!", latencyMs: 420,
});
```

The call returns the id of the new record. The Rate tab now lists the call.

## 4. Rate it

Select the row: the full prompt and response appear below the list. Then:

- **Good** or **Poor** rates it (keys <kbd>g</kbd> / <kbd>b</kbd>); <kbd>j</kbd> / <kbd>k</kbd> move the selection.
- **Add tags, note, correction** (or <kbd>Enter</kbd>) opens a dialog with **Tags**, **Note** and **Better answer** — the answer the model should have given. Press **Save rating**.
- **Delete recording** (or <kbd>Delete</kbd>) removes the line from the trace file after a confirmation.

The filters **Unrated only**, **Errors only**, **All plugins** and **All models** narrow the list. A call that failed cannot be rated; errors are kept for debugging only.

## 5. Find the files

Everything is plain text inside your vault, in the plugin's folder: recordings under `.obsidian/plugins/llm-lab/traces/YYYY-MM-DD.jsonl` (one call per line), ratings in `.obsidian/plugins/llm-lab/dataset.jsonl`. Read them with any editor or `jq`.

## Where next

Set how long traces are kept, keep folders out of the log and switch on personal-data masking under **Settings → LLM Lab** — every setting is described under [Configuration](https://github.com/johannes-kaindl/llm-lab/blob/main/README.md#configuration) in the README, and masking has limits you should read before you rely on it. If something behaves differently from this page, see [Troubleshooting](troubleshooting.md).
