# Development workflow

## Auto-sync (laptop → GitHub)

When working on a laptop and you want local changes to be automatically pushed to the main GitHub repository, run:

```bash
pnpm sync:auto
```

This starts a background loop that every 300 seconds:

- Checks for git changes
- If there are changes: stages, commits with message `auto sync <timestamp>`, and pushes to `origin main`
- If there are no changes: prints "No changes to sync"

Stop it with **Ctrl+C**. Safe for development use; it will not crash if there is nothing to commit.
