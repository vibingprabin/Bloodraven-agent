/**
 * Builds the reviewable starter SKILL.md body used for a new local skill.
 * Persistence and install authority remain with the caller.
 */
export function buildStarterSkillTemplate(id: string, name: string): string {
  return `---
name: ${name}
description: Turn a recurring workflow into reusable local instructions.
allowed-tools:
  - Read
---

# ${name}

Load this skill when the user asks you to complete a task type with a fixed workflow.

## How to use

1. First confirm the user's goal, input material, and delivery format.
2. Read the necessary local files or context; only collect what the task needs.
3. Produce the result step by step; if files need changing, first state what and why.

## Boundaries

- The tools this skill declares are only request hints; they do not grant permissions automatically.
- Do not write sensitive content here; it enters the model context as local skill instructions.
- If this template does not fit your workflow, rename or delete ${id} directly.
`;
}
