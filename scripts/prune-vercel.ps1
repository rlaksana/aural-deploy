# Prune retained Vercel deployments for project aural-deploy.
# Keeps only the newest Ready Production deployment; deletes every older one.
# In-flight builds (Building/Queued/Initializing) are never touched.
# ASCII-only regex: the .ps1 must parse correctly even as ANSI (no BOM).
# Runs weekly via Task Scheduler ("Vercel deploy prune"); safe to run manually anytime.
$ErrorActionPreference = "Continue"
$log = Join-Path $env:TEMP "vercel-prune.log"
function Log($m) { ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) | Tee-Object -FilePath $log -Append }

$rows = @()
# vercel CLI (and its session wrappers) may print the listing on stderr, so merge streams.
$listing = (npx --yes vercel ls aural-deploy --limit 100 2>&1 | ForEach-Object { "$_" })
foreach ($line in $listing) {
  if ($line -match "aural-deploy-([a-z0-9]+)-rlaksanas-projects\.vercel\.app\s+\S") {
    $id = $Matches[1]
    $rows += [pscustomobject]@{
      Id      = $id
      Url     = "https://aural-deploy-$id-rlaksanas-projects.vercel.app"
      Ready   = [bool]($line -match "\bReady\s+Production\b")
      Stable  = [bool]($line -match "\b(Ready|Error|Canceled)\b")
    }
  }
}

$keeper = $rows | Where-Object { $_.Ready } | Select-Object -First 1
if (-not $keeper) { $keeper = $rows | Select-Object -First 1 }
if (-not $keeper) { Log "prune: no deployments found"; exit 0 }

$targets = $rows |
  Where-Object { $_.Stable -and $_.Id -ne $keeper.Id } |
  Select-Object -ExpandProperty Url -Unique

Log ("prune: keeping {0}; {1} to delete" -f $keeper.Id, @($targets).Count)
foreach ($u in $targets) {
  npx --yes vercel rm $u --yes 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { Log "deleted $u" } else { Log "FAILED $u" }
  Start-Sleep -Seconds 1
}
Log "prune: done"
