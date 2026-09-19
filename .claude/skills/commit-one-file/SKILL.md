---
name: commit-one-file
description: Commit work in this repo the way it's done here — exactly ONE file per commit, pushed immediately, ordered so main builds at every commit. Use whenever asked to commit, or to work through a backlog of uncommitted files ("commit", "5 commits", "1 file 1 commit push 10x").
---

# Committing in Sana

The unit of work is **one file → one commit → one push**. Not a batch of files,
not a feature group, and not a batch of commits pushed together at the end.

If asked for N commits, that's N repetitions of the whole unit.

## The loop, per file

```bash
git add <one exact path>     # never -A, never a glob
git diff --cached --name-only # must print exactly one path
git commit -m "<message>"     # real timestamp; never backdate
git push                      # origin main
```

Then repeat. Leave every other pending file untouched.

Commit messages say **why** the file changed, not what a diff already shows.
Wrap them in a heredoc so multi-line bodies survive the shell.

## Order matters: leaf-first, so main never breaks

One-file commits make it easy to push a state that doesn't compile. Order the
backlog so each file depends only on what's already on `main`:

1. Config and docs — zero code risk
2. Models, standalone types, pure helpers — land as valid-but-unused code
3. Then, in order: schemas → services → controllers → routes → client API
   hooks → pages → specs

**Check dependencies against `HEAD`, not the working tree.** The working tree
has everything; `HEAD` may not:

```bash
git show HEAD:<dependency-path> | grep <exported-symbol>
```

A file importing a symbol that only exists in your working copy will compile
locally and break for anyone who pulls.

**Commit `.github/workflows/*` LAST.** Once CI is on the remote, every later
single-file push triggers it, and mid-sequence commits legitimately can't pass
until the feature they belong to is complete.

## Never commit credentials

`TEST_LOGINS.md` holds a working password for every seeded account and the
remote is public GitHub. It is **gitignored**, not merely left uncommitted —
leaving such a file untracked isn't protection, because a later `git add -A`
would sweep it in. If a similar file appears, ignore it rather than skip it.

Verify with `git ls-files | grep -i <name>` — it should return nothing.

## Pitfalls seen in practice

- **A failed `git push` does not mean the commit failed.** On a memory-starved
  machine `git push` died with `fatal: not enough memory for initialization`
  *after* the commit had already landed. Always run `git status -sb` before
  retrying — blindly re-running can double-commit or confuse the sequence.
- **Check `git diff --cached` right before committing.** Something staged in an
  earlier turn can otherwise ride along; this has happened once already with a
  stale rename.
- **Visual-regression baselines belong in git.** Don't ignore
  `client/e2e/__screenshots__/` — the suite compares against those images, so
  ignoring them silently disables visual testing.

## Verify after a batch

```bash
for sha in $(git log --format=%h -<N>); do
  printf "%s  %s file(s)\n" "$sha" "$(git show --stat --format="" --name-only $sha | grep -c .)"
done          # every line must read "1 file(s)"

git status -sb                                     # level with origin/main
npm --prefix client exec tsc -- --noEmit -p tsconfig.app.json
npm --prefix server run test:types
```
