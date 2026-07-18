# Setup GridFinder on Windows

Copy/paste these commands in PowerShell. They put the app at:

`C:\Users\today\cursor\GridFinder`

```powershell
New-Item -ItemType Directory -Force -Path C:\Users\today\cursor | Out-Null
cd C:\Users\today\cursor
if (Test-Path .\GridFinder) { Remove-Item -Recurse -Force .\GridFinder }
git clone --branch cursor/gridfinder-handoff-4242 --single-branch https://github.com/uberslaw/CopperHead.git GridFinder
cd C:\Users\today\cursor\GridFinder
git remote set-url origin https://github.com/uberslaw/GridFinder.git
git push -u origin HEAD:main
```

Then open https://github.com/uberslaw/GridFinder — the code should be there.

To run it:
```powershell
cd C:\Users\today\cursor\GridFinder
npm install
npm approve-scripts electron
npm install
npm start
```

## Update to latest handoff

If you already cloned GridFinder from the handoff branch:

```powershell
cd C:\Users\today\cursor\GridFinder
git pull origin cursor/gridfinder-handoff-4242
npm install
npm start
```
