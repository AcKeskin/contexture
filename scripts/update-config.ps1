# Update this claude-config clone safely on the personal GitHub account.
#
# Flow:
#   1. Ensure the active `gh` account is AcKeskin (switch if not, remember the original).
#   2. Checkout main (carrying local changes; stash + notify only if checkout conflicts).
#   3. Pull latest main.
#   4. Run bootstrap.
#   5. Restore the original gh account if it differed.
#
# Idempotent. Restores gh account even if a step fails.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$TargetAccount = 'AcKeskin'

function Write-Step  ([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Note  ([string]$m) { Write-Host "    $m" -ForegroundColor DarkGray }
function Write-Warn2 ([string]$m) { Write-Host "!!  $m" -ForegroundColor Yellow }

# Run a native command, echoing combined stdout+stderr to the console without
# letting PowerShell re-throw stderr lines as NativeCommandError. Success is
# judged by exit code only. Returns the captured output text.
function Invoke-Native {
    param([Parameter(Mandatory)][scriptblock]$Command)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Command 2>&1 | ForEach-Object { [string]$_ }
    }
    finally {
        $ErrorActionPreference = $old
    }
    if ($out) { $out | ForEach-Object { Write-Host $_ } }
    return $out
}

function Get-ActiveGhAccount {
    # `gh auth status` lists each account; the active one is marked "Active account: true".
    $status = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "gh auth status failed - is the GitHub CLI installed and are you logged in? Output:`n$status"
    }

    $active = $null
    $currentAccount = $null
    foreach ($line in $status) {
        $text = [string]$line
        if ($text -match 'Logged in to github\.com account (\S+)') {
            $currentAccount = $Matches[1]
        }
        elseif ($text -match 'Active account:\s*true' -and $currentAccount) {
            $active = $currentAccount
        }
    }
    return $active
}

$originalAccount = $null
$switched = $false

try {
    # --- 1. gh account ---
    Write-Step "Checking active gh account"
    $originalAccount = Get-ActiveGhAccount
    if (-not $originalAccount) {
        throw "Could not determine the active gh account from 'gh auth status'."
    }
    Write-Note "Active gh account: $originalAccount"

    if ($originalAccount -ne $TargetAccount) {
        Write-Step "Switching gh account to $TargetAccount"
        Invoke-Native { gh auth switch --user $TargetAccount } | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to switch gh account to $TargetAccount. Is it logged in? Run 'gh auth login'."
        }
        $switched = $true
    }
    else {
        Write-Note "Already on $TargetAccount - no switch needed."
    }

    # --- 2. checkout main ---
    Push-Location $RepoRoot
    try {
        $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
        if ($currentBranch -ne 'main') {
            Write-Step "Switching to main (currently on '$currentBranch')"
            # Carry local changes across; only stash if the checkout conflicts.
            $checkout = Invoke-Native { git checkout main }
            if ($LASTEXITCODE -ne 0) {
                Write-Warn2 "Checkout to main conflicted with local changes - stashing them."
                $stashLabel = "update-config auto-stash from $currentBranch"
                Invoke-Native { git stash push -u -m $stashLabel } | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "git stash failed:`n$checkout" }
                Invoke-Native { git checkout main } | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "git checkout main failed even after stashing." }
                Write-Warn2 "Local changes were stashed as: '$stashLabel'. Recover them with 'git stash list' / 'git stash pop'."
            }
        }
        else {
            Write-Note "Already on main."
        }

        # --- 3. pull ---
        Write-Step "Pulling latest main"
        Invoke-Native { git pull --ff-only } | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "git pull --ff-only failed - main may have diverged. Resolve manually."
        }
    }
    finally {
        Pop-Location
    }

    # --- 4. bootstrap ---
    Write-Step "Running bootstrap"
    $bootstrapPath = Join-Path $RepoRoot 'bootstrap/bootstrap.js'
    Invoke-Native { node $bootstrapPath } | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "bootstrap.js exited with code $LASTEXITCODE."
    }

    Write-Step "Done."
}
finally {
    # --- 5. restore original gh account ---
    if ($switched -and $originalAccount) {
        Write-Step "Restoring gh account to $originalAccount"
        Invoke-Native { gh auth switch --user $originalAccount } | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "FAILED to switch gh back to $originalAccount. Run 'gh auth switch --user $originalAccount' manually."
        }
    }
}
