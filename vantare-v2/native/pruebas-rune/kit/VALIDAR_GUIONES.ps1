[CmdletBinding()]
param([Parameter(Mandatory)][string[]]$Roots,[switch]$ExcludeGenerated)
$ErrorActionPreference='Stop'
$issues=[Collections.Generic.List[string]]::new();$files=0
foreach($root in $Roots){
 foreach($file in Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.ps1'){
  if($ExcludeGenerated -and $file.FullName -match '[\\/]fuentes-generadas[\\/]'){continue}
  $files++;$tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
  foreach($error_ in $errors){$issues.Add("$($file.Name):$($error_.Extent.StartLineNumber): $($error_.Message)")}
  foreach($command in $ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst]},$true)){
   $name=$command.GetCommandName()
   if(-not $name){continue}
   $info=Get-Command -Name $name -ErrorAction SilentlyContinue|Select-Object -First 1
   if($null -eq $info){continue}
   if($info -is [Management.Automation.AliasInfo]){$info=$info.ResolvedCommand}
   if($info -isnot [Management.Automation.CmdletInfo]){continue}
   foreach($parameter in $command.CommandElements|Where-Object {$_ -is [Management.Automation.Language.CommandParameterAst]}){
    $value=$parameter.ParameterName
    $matches_=@($info.Parameters.Values|Where-Object {$_.Name -like ($value+'*') -or $value -in $_.Aliases})
    if($matches_.Count -ne 1 -and -not $info.Parameters.ContainsKey($value)){
     $issues.Add("$($file.Name):$($parameter.Extent.StartLineNumber): parámetro no admitido $name -$value")
    }
   }
  }
 }
}
if($issues.Count){$issues;throw 'Falló sintaxis o contrato de parámetros PowerShell.'}
"PASS: $files guiones; sintaxis y parámetros de cmdlets, sin ejecutar campañas ni APIs nativas."
