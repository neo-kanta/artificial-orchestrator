# GitHub Token Permissions

Prefer `gh auth login` when possible. It is easier to revoke, works with Git Credential Manager, and avoids pasting tokens into scripts.

If you must create a personal access token, prefer a fine-grained token with the shortest practical expiration.

## For Publishing This Repo

For `ao publish --repo artificial-orchestrator`, the workflow creates a private repo and pushes commits.

Recommended fine-grained token:

- Resource owner: your personal account, unless you are publishing under an organization.
- Repository access: `All repositories` is usually required before the new repo exists. After creation, replace it with a token limited to selected repositories.
- Repository permissions:
  - `Administration`: Read and write, to create the repository.
  - `Contents`: Read and write, to push commits through Git/contents APIs.
  - `Metadata`: Read-only, automatically required by GitHub.

Optional only if you need these workflows:

- `Pull requests`: Read and write, if the tool will open PRs.
- `Issues`: Read and write, if the tool will create/update issues.
- `Workflows`: Read and write, only if the tool will edit `.github/workflows/*`.

Do not grant these unless you intentionally need them:

- `Secrets`
- `Dependabot secrets`
- `Actions variables`
- `Webhooks`
- `Delete repositories`
- Organization admin/member permissions

## Classic Token Fallback

If a fine-grained token does not work with your `gh` flow, a classic token for creating and pushing private repositories needs `repo`. This is broad access, so use it only when necessary, set an expiration, and revoke it after publishing.

## Practical Setup

```powershell
$env:GH_TOKEN = "paste-token-for-this-shell-only"
gh auth status
node .\bin\duet.js publish --repo artificial-orchestrator
Remove-Item Env:\GH_TOKEN
```

Never commit tokens into `.env`, docs, shell history snippets, or config files.

## Sources

- GitHub Docs: [Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- GitHub Docs: [Create a repository for the authenticated user](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#create-a-repository-for-the-authenticated-user)
- GitHub CLI Manual: [gh repo create](https://cli.github.com/manual/gh_repo_create)
