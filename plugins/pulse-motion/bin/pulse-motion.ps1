# pulse-motion – relais PowerShell : les arguments arrivent tels quels au script Node.
& node (Join-Path $PSScriptRoot '..\scripts\pm.js') @args
exit $LASTEXITCODE
