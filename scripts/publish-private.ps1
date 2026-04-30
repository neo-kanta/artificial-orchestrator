param(
  [string]$Repo = "artificial-orchestrator"
)

$ErrorActionPreference = "Stop"

gh auth status
git status --short
gh repo create $Repo --private --source . --remote origin --push
