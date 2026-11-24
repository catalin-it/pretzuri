@AGENTS.md

## Claude Code specifics
- Subagents live in `.claude/agents/`; skills in `.claude/skills/`.
- Use plan mode for new features. Use subagents in parallel only for independent work (e.g. worker + migration).
- Run `/agents` to inspect, `/clear` between unrelated tasks.
- Git remote: `git@github-pretzuri:catalin-it/pretzuri.git` (SSH alias `github-pretzuri`, deploy key). Never force-push.
