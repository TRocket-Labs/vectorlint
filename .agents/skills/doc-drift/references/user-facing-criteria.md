# User-Facing Change Criteria — VectorLint

The following are examples of user-facing changes in VectorLint. This list is illustrative, not exhaustive — apply the same judgement to anything with a similar character:

- A CLI flag, command, or exit code
- A configuration key in `.vectorlint.ini` or `config.toml`
- An environment variable name or its accepted values
- A rule frontmatter field (name, id, evaluateAs, etc.)
- A preset name or bundled preset behaviour
- An output format (line, json, vale-json) — structure, field names, values
- A scoring behaviour visible in output (thresholds, density calculation, rubric scoring)
- A provider configuration option or supported model list
- An error message or warning the user reads
- A workflow the documentation describes step-by-step

A change is **not** user-facing if it only affects:

- Internal implementation logic with no observable output change
- Test infrastructure
- Build configuration
- Code style or refactoring with identical external behaviour
- Logging that is only visible in debug mode (unless debug mode is documented)

When in doubt, lean toward flagging. A false positive the author dismisses is less costly than a false negative that ships as broken docs.
