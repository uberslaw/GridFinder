# Update local GridFinder from the CopperHead handoff branch
# (needed because origin may point at the empty GridFinder repo)

$ErrorActionPreference = "Stop"
$path = "C:\Users\today\Cursor\GridFinder"

if (-not (Test-Path $path)) {
  Write-Host "Folder not found: $path"
  exit 1
}

Set-Location $path

# Stop a running instance if needed (close the windows manually first if this fails)
Write-Host "Fetching latest GridFinder code..."

git remote remove handoff 2>$null
git remote add handoff https://github.com/uberslaw/CopperHead.git
git fetch handoff cursor/gridfinder-handoff-4242
git checkout -B main handoff/cursor/gridfinder-handoff-4242

Write-Host "Installing dependencies..."
npm install

Write-Host ""
Write-Host "Done. Start with:"
Write-Host "  npm start"
Write-Host ""
Write-Host "You should see TWO windows: a grid overlay and a separate controls panel."
