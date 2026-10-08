param([ValidateSet('GET','POST','PATCH')][string]$Method,[string]$Path)
$ErrorActionPreference='Stop'
# Official CLI owns its session. Never read its credential store or .env files.
$session = & npx -y '@polar-sh/cli@2.0.2' auth whoami 2>$null | Out-String
if ($LASTEXITCODE -ne 0 -or $session -notmatch 'Environment\s+sandbox' -or $session -notmatch '71f1b902-c29a-421b-aeb7-7861d8bbc08d') {
  throw 'Expected active Vantare sandbox session'
}
$bodyText=[Console]::In.ReadToEnd()
$arguments=@('-y','@polar-sh/cli@2.0.2','products')
if ($Method -eq 'GET' -and $Path -match '^/products/\?') {
  $arguments += @('list','--org','71f1b902-c29a-421b-aeb7-7861d8bbc08d','--limit','100')
} elseif ($Path -match '^/products/([0-9a-f-]{36})$') {
  $arguments += @($(if ($Method -eq 'GET') {'get'} elseif ($Method -eq 'PATCH') {'update'} else {throw 'Unsupported operation'}),$Matches[1])
} elseif ($Path -eq '/products/' -and $Method -eq 'POST') {
  $body=$bodyText | ConvertFrom-Json
  if ($body.organization_id -ne '71f1b902-c29a-421b-aeb7-7861d8bbc08d') { throw 'Wrong sandbox organization' }
  $arguments += 'create'
} else { throw 'Unsupported catalog path' }
if ($Method -ne 'GET') { $arguments += @('--data',$bodyText) }
$response=& npx @arguments | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Polar catalog operation failed' }
if ($Path -match '^/products/\?') {
  $list=$response | ConvertFrom-Json
  # Annual marker is server metadata. Fetch the full list, then filter locally.
  $items=@($list.items | Where-Object { -not $_.is_archived -and $_.metadata.vantare_checkout_key -eq 'pro_annual' })
  @{items=$items} | ConvertTo-Json -Depth 20 -Compress
} else { [Console]::Out.Write($response) }
