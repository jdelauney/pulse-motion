# pulse-motion – relais PowerShell : les arguments arrivent tels quels au script Node.
# Node absent : message en français sur la sortie standard (en UTF-8, caractères écrits par leur code), code 1.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
  [Console]::Out.WriteLine("Node.js introuvable : $([char]0xAB) node $([char]0xBB) n'est pas install$([char]0xE9).")
  exit 1
}
& node (Join-Path $PSScriptRoot '..\scripts\pm.js') @args
exit $LASTEXITCODE
