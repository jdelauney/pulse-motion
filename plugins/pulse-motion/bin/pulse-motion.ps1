# pulse-motion – relais PowerShell : les arguments arrivent tels quels au script Node.
# Node.js : celui du PATH, sinon un emplacement connu (installé à l'instant, avant que l'outil ne le voie : Program Files,
# AppData, lien de nvm-windows). PM_NODE_EMPLACEMENTS (chemins séparés par « ; ») remplace la liste (tests).
# Node absent : message en français sur la sortie standard (en UTF-8, caractères écrits par leur code), code 3.
$node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $node) {
  $liste = if ($env:PM_NODE_EMPLACEMENTS) { $env:PM_NODE_EMPLACEMENTS -split ';' }
    else { @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe", "$env:NVM_SYMLINK\node.exe") }
  $node = $liste | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
}
if (-not $node) {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
  [Console]::Out.WriteLine("Node.js introuvable : $([char]0xAB) node $([char]0xBB) n'est pas install$([char]0xE9).")
  exit 3
}
& $node (Join-Path $PSScriptRoot '..\scripts\pm.js') @args
exit $LASTEXITCODE
