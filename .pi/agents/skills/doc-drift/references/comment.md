# Output Format — Doc Drift

## Environment detection

Check for the `GITHUB_ACTIONS` environment variable.
- If `GITHUB_ACTIONS=true` → GitHub context: write one report file per behavioral change to the numbered paths given in the initial message. Do not print to terminal. Do not interact with the user.
- If `GITHUB_ACTIONS` is not set → local context: print findings to the terminal, then ask the user whether they want to update the documentation.

**Language note:** never use the word "intent" in any output. Describe each behavioral change in plain language.

---

## GitHub context — drift detected

One file per behavioral change. Each file is a self-contained PR comment.

````markdown
## ⚠️ Doc drift — {plain language description of what changed}

{for each drift finding under this behavioral change:}
### `{doc file path}` — {section name}

**What the doc claims:** {quote or close paraphrase of the invalidated claim}
**What's now true:** {one sentence}

Fix prompt:
~~~
`{doc file}`, {section}: "{old claim}" is no longer accurate — {correct behaviour}. Update it. Keep all existing structure, tone, and style.
~~~

---
{end for}
````

---

## GitHub context — undocumented user-facing change

````markdown
## 📝 Undocumented change — {plain language description of what changed}

{for each undocumented finding under this behavioral change:}
### {suggested doc file, or "New page: {suggested title}"}

**What changed:** {one sentence}
**Why it needs docs:** {one sentence}

Fix prompt:
~~~
Add documentation to `{suggested file}` covering {what changed}. {one sentence on what the new content should say}. Keep all existing structure, tone, and style.
~~~

---
{end for}
````

---

## GitHub context — no issues found

A single file: `.doc-drift-1.md`.

````markdown
## ✅ No documentation drift detected

The changes in this PR do not invalidate any existing documentation and do not introduce undocumented user-facing behaviour.

**Search coverage:** {list the behavioral changes extracted and the doc files checked for each, so the author can verify the check was thorough}
````

---

## Local context (no GITHUB_ACTIONS)

Print each behavioral change's findings to the terminal in a readable format. After printing all findings, ask:

> "Would you like me to help you update the documentation now?"

Wait for the user's response. If yes, guide them through the changes. If no, summarise what they would need to do manually and exit.
