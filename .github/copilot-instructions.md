# Project Operations

## Commit

When the user asks for `Коммит` or asks to commit the changes:

- Review `git status` and the diff. Stage only files related to the requested work; never include secrets, local environment files, generated data, or unrelated user changes.
- Run the relevant tests before committing. If they fail, report the failure and do not commit.
- Create a concise commit message describing the change, then push the commit to the current branch's configured upstream.
- Never force-push. If there is no configured upstream or the push fails, keep the commit and report the exact blocker; do not guess a remote or branch.
- If there are no changes to commit, say so and do not create an empty commit.

## Publish to kvn7.ru

When the user asks to publish or deploy the site:

- The server is `kvn7.ru`; SSH access is configured for `root` with keys. Connect as `ssh root@kvn7.ru`; do not ask for or expose private key contents.
- The documented application directory is `/opt/simplechat` and the systemd unit is `simplechat`. Verify the live server's current layout before changing files; do not assume an undocumented update mechanism.
- Review the working tree and run relevant tests before publishing. Publish only the intended application changes.
- Preserve `/opt/simplechat/simplechat.env`, `/opt/simplechat/data/`, and `/opt/simplechat/upload/`. Never overwrite or delete runtime configuration, database files, or uploaded files.
- After updating the application, restart `simplechat` and verify that the service is active and `https://kvn7.ru/` responds successfully. Report any failed check and do not claim a successful deployment.
- Do not perform a deployment unless the user requested it. Do not run destructive cleanup or database migrations without explicit authorization.