# WORKFLOW — MANDATORY FOR ANY PROMPT THAT RESULTS IN CODE CHANGES

**If you are going to use the Edit or Write tool, you MUST complete all applicable steps below before reporting completion.** This applies to every type of work: bug fixes, features, refactoring, config changes — no exceptions.

Execute these steps in order. Do NOT skip steps.

1. **Understand** — Read relevant code, ask clarifying questions, identify gaps and opportunities. For bugs: reproduce the issue first.
2. **Plan** — Create a plan, get user approval, iterate if needed *(skip for trivial changes)*
3. **Spec Documentation** — Update spec via `/sync-spec-kit` *(skip on `main` branch or trivial changes)*
4. **Implement** — Write the code
5. **Test** — Define DoD checklist, test, fix, repeat until it works *(see Step 5 below)*
6. **Feature Documentation** — Update docs via `/docs-feature` *(skip on `main` branch or trivial changes)*
7. **Report** — Short summary: what was done, what was tested, whether docs were updated

**NEVER report completion without first testing.** If you write code and stop without verifying it works, you have failed. Testing is YOUR responsibility — the user should never need to ask you to test.

**Trivial changes** (typo, one-line fix, config tweak): skip steps 2, 3, and 6. State what you'll do and proceed.

**On `main` branch**: skip steps 3 and 6 — spec and feature docs are tied to feature branches only.
