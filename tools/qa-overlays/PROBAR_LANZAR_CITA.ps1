#requires -Version 7
$ErrorActionPreference='Stop'
$tokens=$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'LANZAR-CITA.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'El lanzador no parsea'}
foreach($name in 'Read-CitaConfig','Get-CitaShutdownArguments'){
 $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $name},$false)
 if(-not $function){throw "Falta $name"}
 . ([scriptblock]::Create($function.Extent.Text))
}
foreach($case in @(
 @{json='{"modo":"real","apagar":false}';value=$false;arguments='-SinApagado'},
 @{json='{"modo":"real","apagar":true}';value=$true;arguments=''},
 @{json='{"modo":"ensayo","apagar":false}';value=$false;arguments=''}
)){
 $config=Read-CitaConfig ([Text.Encoding]::UTF8.GetBytes($case.json))
 if($config.apagar -isnot [bool] -or $config.apagar -ne $case.value -or ((Get-CitaShutdownArguments $config) -join ' ') -cne $case.arguments){
  throw "Política de apagado incorrecta: $($case.json)"
 }
}
foreach($json in '{"modo":"real"}','{"modo":"real","apagar":"false"}','{"modo":"real","apagar":0}','{"modo":"real","apagar":null}'){
 $rejected=$false
 try{$null=Read-CitaConfig ([Text.Encoding]::UTF8.GetBytes($json))}catch{$rejected=$_.Exception.Message -ceq 'La configuración exige apagar como booleano JSON'}
 if(-not $rejected){throw "apagar incompleto o no booleano aceptado: $json"}
}
'PASS: apagar obligatorio y booleano; servidor con/sin apagado y ensayo.'
