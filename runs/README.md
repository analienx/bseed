# Sanitized executor evidence

Each run gets a directory such as:

```text
runs/2026-08-18-issue-2-map/
```

Only sanitized evidence belongs here.

Raw/unsanitized material belongs under `.local/runs/<run-id>/` and is ignored by Git.

Before committing:

```powershell
python .\scripts\validate-evidence.py .\runs
```

Executor evidence PRs must not contain production firmware changes.