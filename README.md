# claude-mods

Claude Code mods (function-hook plugins). Needs Claude Code 2.1.286 or later.

## Install

```
/plugin marketplace add WilsonKinyua/claude-mods
/plugin install house-rules@wilson-mods
/plugin install usage-band@wilson-mods
/reload-plugins
```

## Mods

- **house-rules**: strips `-c user.*` and `--author` overrides and AI co-author trailers, renames `claude/`, `ai/` and `bot/` branches to `feat/…`, and blocks commits, pushes or PRs under the wrong identity. To allow a different identity in one repo, run `git config house-rules.allow-identity true` there yourself.
- **usage-band**: 5h and 7d limit rings with reset countdowns, context fill, session/today/month cost and the git branch above the prompt. `/usage` opens a details pane.

## Develop

```
claude --plugin-dir ./plugins/usage-band
claude plugin validate ./plugins/usage-band
```
