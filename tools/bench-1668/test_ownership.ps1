$ErrorActionPreference='Stop'
$temporary=Join-Path ([IO.Path]::GetTempPath()) ('bench1668-ownership-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $temporary | Out-Null
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile("$PSScriptRoot/INICIAR.ps1",[ref]$tokens,[ref]$errors)
if($errors){throw 'No se pudo parsear el kit'}
foreach($name in @('RememberOwned','CloseOwned')){
 $definition=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true) | Where-Object Name -eq $name
 . ([scriptblock]::Create($definition.Extent.Text))
}
$owned=@();$launchRoot=0;$rootProcess=$null;$unrelated=$null
try{
 'Start-Sleep -Seconds 30' | Set-Content "$temporary/leaf.ps1"
 $parent=@'
param([string]$Folder)
$child=Start-Process powershell.exe -ArgumentList @('-NoProfile','-File',('"'+$Folder+'/leaf.ps1"')) -WindowStyle Hidden -PassThru
$child.Id | Set-Content ($Folder+'/child.pid')
Start-Sleep -Seconds 30
'@
 $parent | Set-Content "$temporary/parent.ps1"
 $unrelated=Start-Process powershell.exe -ArgumentList @('-NoProfile','-File',('"'+"$temporary/leaf.ps1"+'"')) -WindowStyle Hidden -PassThru
 $started=Get-Date
 $rootProcess=Start-Process powershell.exe -ArgumentList @('-NoProfile','-File',('"'+"$temporary/parent.ps1"+'"'),'-Folder',('"'+$temporary+'"')) -WindowStyle Hidden -PassThru
 $launchRoot=$rootProcess.Id
 $deadline=(Get-Date).AddSeconds(15)
 while(-not(Test-Path "$temporary/child.pid")){
  if((Get-Date) -gt $deadline){throw 'No nació el hijo de prueba'}
  Start-Sleep -Milliseconds 100
 }
 $childId=[int](Get-Content "$temporary/child.pid")
 RememberOwned $started
 if($owned.Id -notcontains $launchRoot -or $owned.Id -notcontains $childId){throw 'No se identificó el árbol propio'}
 if($owned.Id -contains $unrelated.Id){throw 'Se incluyó un proceso ajeno'}
 CloseOwned
 if(Get-Process -Id $rootProcess.Id,$childId -ErrorAction SilentlyContinue){throw 'No se cerró el árbol propio'}
 if(-not(Get-Process -Id $unrelated.Id -ErrorAction SilentlyContinue)){throw 'Se cerró el proceso ajeno'}
 Write-Output 'PASS: padre e hijo propios cerrados; proceso ajeno del mismo nombre conservado.'
}finally{
 foreach($p in @($rootProcess,$unrelated)){
  if($p -and -not $p.HasExited){Stop-Process -Id $p.Id}
 }
 # Keep the tiny scripts as evidence if a failure interrupted child discovery.
}
