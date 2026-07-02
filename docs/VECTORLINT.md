# VectorLint example styling rules

{/* This file is prepended to the system prompt for every VectorLint evaluation 
  This file defines global style instructions for all VectorLint evaluations.
  VectorLint prepends its contents to the system prompt for every rule it runs.
  Keep this file under ~800 tokens to avoid performance and cost issues.
  Adapt the rules below to match your team's style guide.
*/}

## Voice and tone

- Write in active voice. Never use passive constructions.
- Use present tense throughout.
- Address the reader as "you." Do not use "the user," "the developer," or "one."
- Do not call any step or feature "simple," "easy," "straightforward," or "just."
- Do not use marketing language, superlatives, or exclamation marks.
- Do not use filler phrases: "please note," "at this time," "it is worth mentioning."
- Do not use weasel words when the correct answer is known: "might," "could," "generally," "typically."
- Do not attribute motivations or feelings to software. Systems execute; they do not think, want, or know.
- Do not use "execute" to refer to using software. Use "run," "deploy," or "instantiate" depending on the context.
- Contractions are acceptable and preferred when they sound natural.

## Structure

- Every page must open with a short description (1–2 sentences) stating what the page covers and who it is for.
- Do not duplicate the page title in the short description.
- Use sentence case for all headings. Capitalize only the first word and proper nouns.
- Do not end headings with punctuation.
- Do not skip heading levels.
- Do not stack two headings with no body content between them.
- Start procedure headings with an imperative verb, not a gerund.

## Lists

- Introduce every list with a complete sentence ending in a colon.
- Do not let a list complete a sentence that begins above it.
- All items in a list must follow parallel grammatical structure.
- Do not create a list with fewer than two items. Use prose instead.
- Do not nest lists more than two levels deep.

## Procedures

- Use numbered steps for sequential tasks.
- Write one action per step.
- Start each step with an imperative verb.
- List prerequisites before step one under a "Before you begin" or "Prerequisites" heading.
- Include a verification step when the outcome is not visually obvious.

## Code and technical content

- Put every command the reader must type in a code block, not inline prose.
- Include a language identifier on every fenced code block.
- Format command names, file names, and parameter names as inline code.
- Format UI element names in bold, not inline code.
- Use `<PLACEHOLDER_NAME>` format for values the reader must replace.
- Explain every placeholder immediately after the code block.

## Language

- Define every acronym on first use: full term, then acronym in parentheses.
- After first use, use the acronym consistently. Do not alternate.
- Do not use "e.g.," "i.e.," or "etc." Use "for example," "that is," and "and so on."
- Spell out numbers zero through nine. Use numerals for 10 and above.
- Always use numerals for measurements, versions, and technical values.

## Terminology

- Use one term per concept. Do not introduce synonyms to avoid repetition.
- Use the official name of a product exactly as the project spells and capitalizes it.

## Admonitions

- Use admonitions sparingly. Do not use more than one per section.
- Keep admonition content to one or two sentences.
- Do not begin admonition content with the admonition type label ("Note:", "Warning:").
- Use Warning only for risks of data loss, system failure, or security vulnerability.
- Use Tip only for optional techniques. Do not put required steps in a Tip.
