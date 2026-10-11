Welcome to my personal website!

## Local development

This project uses Next.js and Node.js 22. This workspace has a project-local
Node.js installation in `.local/node`; dependencies and the npm cache also stay
inside the project.

Install dependencies from the lockfile:

```sh
sh scripts/local.sh ci
```

Start the development server:

```sh
sh scripts/local.sh
```

Open http://127.0.0.1:3000. Changes reload automatically. Press Ctrl+C to stop.
For a production build, run `sh scripts/local.sh run build`.

On a fresh checkout, install Node.js 22 first; the script also supports Node.js
on your normal PATH. The `.local` directory is ignored by Git.

The contact form requires these values in an untracked `.env.local` file:

```dotenv
USER_EMAIL=
GMAIL_APP_PASSWORD=
RECIPIENT_EMAIL=
```

Use a Gmail app password for `GMAIL_APP_PASSWORD`. These settings are optional
for browsing the site, and must be configured to send contact emails. The
Substack feed requires internet access.
