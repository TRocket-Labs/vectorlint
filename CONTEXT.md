# VectorLint

VectorLint is a content review harness. This language file defines the terms used to describe reviews, rules, findings, scoring, and execution so product, documentation, tests, and code can share the same vocabulary.

## Language

### Review Model

**Content Review Harness**:
A system that reviews supplied target content against source-backed rules and returns structured review results. The harness does not own exploration, research, workspace search, or content rewriting.
_Avoid_: Autonomous agent, workspace agent, agent mode

**Review**:
A review of target content against one or more rules. It produces findings, scores, diagnostics, usage metadata, and output.
_Avoid_: Lint run when referring to the domain process, agent session

### Review Inputs

**Caller**:
The person or system that invokes VectorLint and supplies the target, target content, and any allowed review context. A caller does not define rules or configuration as part of the review invocation.
_Avoid_: Agent, user agent, workspace owner

**Target**:
The subject of a review. A target identifies what VectorLint is reviewing, regardless of whether it came from a file, memory, or another caller-provided source.
_Avoid_: File when the review subject may not be a file, page when the content may not be documentation

**Target File**:
A file used as the source of a target. A target file is one way to provide target content, but not every target must come from a file.
_Avoid_: Target when the distinction between the file and the review subject matters

**Target Content**:
The actual text or content body reviewed for a target. Findings and finding evidence are grounded in target content.
_Avoid_: Target file, page content

**Review Context**:
Additional content explicitly supplied to VectorLint for a review. Review context is in scope only because it was allowed as part of the review input.
_Avoid_: Caller context, workspace context, discovered context, ambient context

**On-Page Boundary**:
The rule that VectorLint reviews only target content and review context. VectorLint must not discover arbitrary workspace files or expand the review scope on its own.
_Avoid_: Workspace scope, project-wide scope, cross-file scope

### Rules

**Rule**:
A source-backed instruction that defines observable violation conditions VectorLint should look for. Rules exist before a review is invoked.
_Avoid_: Prompt when referring to the domain concept, model instruction when implying the model authored it

**Via Negativa Review**:
A review approach that looks for evidence a rule was violated rather than evidence the content aligns with an ideal. VectorLint rules should be written so a model can answer whether an observable violation condition is present.
_Avoid_: Alignment review, subjective assessment

**Violation Condition**:
An observable yes/no condition that counts as a rule violation when present in target content. A violation condition should be specific enough to ground a finding in finding evidence.
_Avoid_: Criterion when it implies subjective grading, preference, guideline

**Rule Pack**:
A named collection of related rules that can be applied together.
_Avoid_: Preset when describing the domain concept, folder

**Review Configuration**:
Pre-existing settings that determine how VectorLint runs reviews, selects rules, and formats behavior. Configuration is not the same as target content or review context.
_Avoid_: Caller input when referring to review invocation, target configuration

**Check Rule**:
A rule expressed through observable violation conditions. This is the only future-facing rule style in VectorLint.
_Avoid_: Direct rule, standard rule

### Execution

**Model Call**:
The call shape VectorLint uses to run a reviewer model against target content during a review.
_Avoid_: Execution strategy, content access, process mode, rule type, mode

**Single Model Call**:
A model call where VectorLint supplies the review request and target content without giving the model a read tool. If VectorLint chunks a large target, each chunk is still reviewed through a single model call.
_Avoid_: Direct strategy, standard mode, check path

**Agent Model Call**:
A bounded model call where the model may request sections of the target content through a single target-scoped read capability. This is for context management during large or context-sensitive reviews; it is not workspace exploration.
_Avoid_: Autonomous agent mode, workspace agent, file reader

**Auto Model Call**:
The model call value where VectorLint deterministically chooses between single and agent.
_Avoid_: Smart mode, agent fallback

**Target Read Capability**:
The bounded ability to read line ranges from target content. It cannot read arbitrary files, search the workspace, rewrite rules, or create top-level workspace findings.
_Avoid_: Tool suite, workspace tools, read_file

### Findings

**Candidate Finding**:
A potential issue raised before VectorLint has decided whether it should be reported. Candidate findings may be filtered out or become diagnostics.
_Avoid_: Violation when the issue has not been accepted, result

**Verified Finding**:
A finding that VectorLint has accepted for reporting because it is grounded in the target content and passes review filters.
_Avoid_: Issue when finding-evidence status matters, raw finding

**Finding**:
A reported content issue produced by a review. When precision matters, use candidate finding or verified finding.
_Avoid_: Violation as the default user-facing term, problem

**Finding Evidence**:
The exact target-content text or surrounding context that supports a finding.
_Avoid_: Quote when the text may include surrounding context, match when referring to the concept rather than a located span

**Finding Evidence Verification**:
The act of confirming that the finding evidence for a candidate finding can be located in the target content. Unverified finding evidence should not become a verified finding.
_Avoid_: Line fallback, model-provided location

**Finding Processing**:
The review step that turns candidate findings into verified findings, diagnostics, scores, and final review output.
_Avoid_: Projection, result processing, output processing

**Diagnostic**:
A structured note about review execution or finding processing, especially when something affects trust, completeness, or interpretation but is not itself a content finding.
_Avoid_: Finding, warning when referring to the structured domain object

### Scoring And Output

**Severity**:
The impact level attached to a finding or rule outcome.
_Avoid_: Priority, importance

**Score**:
A normalized quality measurement for a rule or review. Scores come from verified finding count or density for objective violation checks.
_Avoid_: Grade when referring to the domain object, rating

**Review Result**:
The structured outcome of a review: verified findings, scores, diagnostics, usage metadata, and operational status.
_Avoid_: Projection result, formatter result, raw model output

**Output Format**:
The representation used to present a review result to a human or machine, such as line output or JSON.
_Avoid_: Review result, report type

**Review Budget**:
The explicit limits for a review, such as model calls, target size, review context size, chunks per rule, and duration. A review budget limits work, not the number of verified findings emitted.
_Avoid_: Rate limit, timeout when referring to the full budget concept

### Historical Terms

**Autonomous Agent Mode**:
The old VectorLint direction where VectorLint exposed workspace tools to a model and let it explore beyond the target content. This is historical language only; current domain language should use single model call, agent model call, caller, and content review harness.
_Avoid_: Agent mode as a current feature, workspace-agent review
