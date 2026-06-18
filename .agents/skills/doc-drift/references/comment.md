# Output Format — Doc Drift

## Environment detection

Check for the `GITHUB_ACTIONS` environment variable.
- If `GITHUB_ACTIONS=true` → GitHub context: write one report file per behavioral change to the numbered paths given in the initial message. Do not print to terminal. Do not interact with the user.
- If `GITHUB_ACTIONS` is not set → non-GitHub context: present the findings directly to the user using the non-GitHub structures below. Do not rely on collapsible sections or GitHub-only HTML.

**Language note:** never use the word "intent" in any output. Describe each behavioral change in plain language.
**Tone note:** prefer concise review-comment language over report language. Do not restate the checking process or mention internal instructions.

---

## GitHub context — drift detected

One file per behavioral change. Each file is a self-contained PR comment.

````markdown
{2 sentences describing the behavioral change and why the current documentation is now inaccurate or incomplete.}

📍 Affected files: `{doc file path}` `{doc file path}` `{doc file path}`

<details>
<summary>Details</summary>

{for each drift finding under this behavioral change:}
- `{doc file path}`: {1-2 sentences describing what it currently claims and what is now more accurate.}
{end for}

</details>

<details>
<summary>Prompt for AI agents</summary>

```text
Update the documentation for this behavioral change.

Files to update:
{for each drift finding under this behavioral change:}
- {doc file path}
{end for}

For each file, replace outdated or incomplete language with the current behavior. Keep the existing structure, tone, and style. Do not rewrite unrelated sections.
```

</details>
````

---

## GitHub context — undocumented user-facing change

````markdown
{2 sentences describing the behavioral change and why it needs documentation coverage.}

📍 Affected files: `{suggested doc file}` `{suggested doc file}`

<details>
<summary>Details</summary>

{for each undocumented finding under this behavioral change:}
- `{suggested doc file, or "New page: {suggested title}"}`: {1-2 sentences describing what changed and what documentation should be added.}
{end for}

</details>

<details>
<summary>Prompt for AI agents</summary>

```text
Add documentation for this behavioral change.

Files to update:
{for each undocumented finding under this behavioral change:}
- {suggested doc file, or "New page: {suggested title}"}
{end for}

Document the new behavior clearly and place it in the most relevant existing doc when possible. Keep the existing structure, tone, and style. Do not rewrite unrelated sections.
```

</details>
````

---

## GitHub context — no issues found

A single file: `.doc-drift-1.md`.

````markdown
**✅ No documentation drift detected... all good here!**

<details>
<summary>Details</summary>

{2-3 short sentences describing what changed and why it does not create documentation drift. Keep the explanation grounded in the change itself: for example, explain that the change affects internal behavior, implementation structure, or non-user-facing logic, and that no existing documentation makes claims that this change would invalidate. Do not list every file searched or describe the skill instructions.}

</details>
````

---

## Non-GitHub context — drift detected

Present one self-contained message per behavioral change.

````markdown
{2 sentences describing the behavioral change and why the current documentation is now inaccurate or incomplete.}

📍 Affected files: `{doc file path}` `{doc file path}` `{doc file path}`

Details:
- `{doc file path}`: {1-2 sentences describing what it currently claims and what is now more accurate.}
- `{doc file path}`: {1-2 sentences describing what it currently claims and what is now more accurate.}
````

---

## Non-GitHub context — undocumented user-facing change

Present one self-contained message per behavioral change.

````markdown
{2 sentences describing the behavioral change and why it needs documentation coverage.}

📍 Affected files: `{suggested doc file}` `{suggested doc file}`

Details:
- `{suggested doc file, or "New page: {suggested title}"}`: {1-2 sentences describing what changed and what documentation should be added.}
- `{suggested doc file, or "New page: {suggested title}"}`: {1-2 sentences describing what changed and what documentation should be added.}
````

---

## Non-GitHub context — no issues found

Present a single short message.

````markdown
**✅ No documentation drift detected... all good here!**

Details:
{2-3 short sentences describing what changed and why it does not create documentation drift. Keep the explanation grounded in the change itself: for example, explain that the change affects internal behavior, implementation structure, or non-user-facing logic, and that no existing documentation makes claims that this change would invalidate. Do not describe the checking process or list every file searched.}
````

---

## Non-GitHub context — follow-up

After presenting all findings, ask:

> "Would you like me to help you update the documentation now?"

Wait for the user's response. If yes, guide them through the changes. If no, summarise what they would need to do manually and exit.
