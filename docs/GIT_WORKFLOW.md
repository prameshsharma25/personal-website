# Tracking website changes

Work in `/Users/sharmapk/Desktop/personal-website`. This is the existing repository
connected to `https://github.com/prameshsharma25/personal-website`; its previous
history is preserved. The new work is on the local `website-growth` branch.
`main` stays at the version from before these changes.

The `scripts/git.sh` helper runs Git from this repository and uses the installed
macOS Command Line Tools directly. This avoids the Xcode launcher on this Mac.
All examples also work with ordinary `git` when it is available on your PATH.

## Review changes

```sh
cd /Users/sharmapk/Desktop/personal-website
sh scripts/git.sh status
sh scripts/git.sh log --oneline -8
sh scripts/git.sh diff main...HEAD --stat
sh scripts/git.sh diff main...HEAD -- pages/index.tsx
```

`diff main...HEAD` shows the saved website work. `diff` by itself shows edits you
have made since the last commit; `diff --cached` shows changes selected for the
next commit. A clean status means the current work has been saved in commits.

## Save future edits

Edit your files, then review and commit the paths you intended to change:

```sh
sh scripts/git.sh status
sh scripts/git.sh diff
sh scripts/git.sh add pages/index.tsx styles/Home.module.css
sh scripts/git.sh diff --cached
sh scripts/git.sh commit -m "Refine the homepage introduction"
```

Replace the example paths and message with your actual changes. Keep each commit
focused so its purpose is clear. A commit saves a local checkpoint; it does not
publish your website.

## Start another change

Create another branch from your current work when you want to keep edits separate:

```sh
sh scripts/git.sh switch -c improve-contact-page
```

Open the `personal-website` folder in your editor to use its Source Control view.
If a VS Code-compatible editor cannot find Git on this Mac, set its **Git: Path**
to `/Library/Developer/CommandLineTools/usr/bin/git`.

## Back up the branch on GitHub

No remote push was performed during this setup. When you want to upload the
branch, use:

```sh
sh scripts/git.sh push -u origin website-growth
```

Pushing can trigger the repository's existing automation or hosting previews.
Review a pull request into `main` when you are ready to merge the website work.

## Files kept local

`.env.local`, other secret environment files, `private-products/`, dependencies,
and build output are ignored. `.env.example` is tracked as a blank configuration
template. The paid essay files require a separate private backup and delivery
storage; a GitHub checkout will not contain them.

Run the website locally with `sh scripts/local.sh`. The payment and deployment
settings are documented in [WEBSITE_GROWTH_SETUP.md](WEBSITE_GROWTH_SETUP.md).
