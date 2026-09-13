# Supervisor ↔ Executor control

Authoritative control channel: `analienx/bseed` issue **#1**.

## Executor proposal

```markdown
## PROPOSAL / <phase>
### Current state
- ...
### Proposed mutation
```text
exact commands/actions
```
### Expected result
- ...
### Verification
- ...
### Rollback
- ...
### Protected invariants
- ...
```

Then STOP.

## Supervisor response

Only a response beginning with `APPROVED` authorizes the proposed mutation.

Other states:

- `CORRECTION` — proposal needs exact changes;
- `BLOCK` — do not execute;
- `SUPERSEDING` — older pending instruction must not run.

## Executor result

```markdown
## RESULT / <phase>
### Executed
- ...
### Result
- ...
### Verification
- PASS/FAIL per gate
### Current state
- ...
### Unexpected behavior
- NONE or details
```

## Blocked

Unexpected result => post `BLOCKED`, include exact failing command/action, redacted output, current state and proposed next diagnostic step, then stop.