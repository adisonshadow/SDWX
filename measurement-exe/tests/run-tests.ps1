$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$candidates = @(
  (Join-Path $root 'build\Release\measurement-adapter.exe'),
  (Join-Path $root 'build\measurement-adapter.exe')
)
$script:exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $script:exe) {
  Write-Output 'FAIL measurement-adapter.exe not found'
  exit 1
}

$script:proc = $null
$script:listener = $null
$script:shared = $null
$script:listenerPs = $null
$script:listenerRs = $null
$script:callbackUrl = $null

function Stop-Adapter {
  Get-Process -Name 'measurement-adapter' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 400
}

function Stop-Callback {
  if ($script:shared) { $script:shared.stop = $true }
  if ($script:listener) {
    try { $script:listener.Stop() } catch {}
  }
  if ($script:listenerPs) {
    try { $script:listenerPs.Stop() | Out-Null } catch {}
    try { $script:listenerPs.Dispose() } catch {}
  }
  if ($script:listenerRs) {
    try { $script:listenerRs.Close() } catch {}
    try { $script:listenerRs.Dispose() } catch {}
  }
  $script:listener = $null
  $script:shared = $null
  $script:listenerPs = $null
  $script:listenerRs = $null
}

function Fail([string]$detail) {
  Write-Output "FAIL $detail"
  exit 1
}

function Start-CallbackListener {
  Stop-Callback
  $script:shared = [hashtable]::Synchronized(@{
    status = 200
    stop = $false
    posts = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
  })
  $script:listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, 0)
  $script:listener.Start()
  $port = $script:listener.LocalEndpoint.Port
  $script:callbackUrl = "http://127.0.0.1:$port/api/measurement/result"
  $script:listenerRs = [runspacefactory]::CreateRunspace()
  $script:listenerRs.Open()
  $script:listenerPs = [powershell]::Create()
  $script:listenerPs.Runspace = $script:listenerRs
  $script:listenerRs.SessionStateProxy.SetVariable('Listener', $script:listener)
  $script:listenerRs.SessionStateProxy.SetVariable('Shared', $script:shared)
  [void]$script:listenerPs.AddScript(@'
while (-not $Shared.stop) {
  $client = $null
  try {
    $client = $Listener.AcceptTcpClient()
  } catch {
    break
  }
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 8000
    $header = ''
    $one = New-Object byte[] 1
    while ($header.Length -lt 1000000) {
      $n = $stream.Read($one, 0, 1)
      if ($n -le 0) { break }
      $header += [char]$one[0]
      if ($header.EndsWith("`r`n`r`n")) { break }
    }
    $len = 0
    if ($header -match '(?i)Content-Length:\s*(\d+)') { $len = [int]$Matches[1] }
    $bodyBytes = New-Object byte[] ([Math]::Max($len, 0))
    $got = 0
    while ($got -lt $len) {
      $n = $stream.Read($bodyBytes, $got, $len - $got)
      if ($n -le 0) { break }
      $got += $n
    }
    $body = [Text.Encoding]::UTF8.GetString($bodyBytes, 0, $got)
    [void]$Shared.posts.Add($body)
    $status = 200
    try { $status = [int]$Shared.status } catch { $status = 200 }
    $reason = 'OK'
    if ($status -lt 200 -or $status -ge 300) { $reason = 'ERR' }
    $resp = "HTTP/1.1 $status $reason`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
    $out = [Text.Encoding]::ASCII.GetBytes($resp)
    $stream.Write($out, 0, $out.Length)
    $stream.Flush()
  } catch {
  } finally {
    if ($client) { $client.Close() }
  }
}
'@)
  [void]$script:listenerPs.BeginInvoke()
}

function Clear-Posts {
  if ($script:shared) { $script:shared.posts.Clear() }
}

function Start-Adapter([int]$TimeoutSeconds, [int]$RetryMs, [bool]$Autotest, [string]$ProcessMode = '') {
  Stop-Adapter
  $dir = Split-Path -Parent $script:exe
  Remove-Item (Join-Path $dir 'callback.json') -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $dir 'config.json') -Force -ErrorAction SilentlyContinue
  if ($Autotest) { $env:MEASUREMENT_AUTOTEST = '1' }
  else { Remove-Item Env:MEASUREMENT_AUTOTEST -ErrorAction SilentlyContinue }
  if ($ProcessMode) { $env:MEASUREMENT_PROCESS_MODE = $ProcessMode }
  else { Remove-Item Env:MEASUREMENT_PROCESS_MODE -ErrorAction SilentlyContinue }
  $env:MEASUREMENT_CONFIRM_TIMEOUT_SECONDS = "$TimeoutSeconds"
  $env:MEASUREMENT_CALLBACK_RETRY_MS = "$RetryMs"
  $env:MEASUREMENT_PORT = '3133'
  $script:proc = Start-Process -FilePath $script:exe -WorkingDirectory $dir -PassThru
  $deadline = (Get-Date).AddSeconds(20)
  do {
    try {
      $req = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:3133/api/measurement/health')
      $req.Method = 'GET'
      $req.Timeout = 1000
      $resp = $req.GetResponse()
      $code = [int]$resp.StatusCode
      $resp.Close()
      if ($code -eq 200) { return }
    } catch {
      Start-Sleep -Milliseconds 200
    }
  } while ((Get-Date) -lt $deadline)
  Fail 'adapter did not become healthy'
}

function Invoke-Api([string]$Method, [string]$Path, [string]$JsonBody) {
  $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:3133$Path")
  $req.Method = $Method
  $req.Timeout = 30000
  if ($Method -ne 'GET') {
    $req.ContentType = 'application/json; charset=utf-8'
    $bytes = [Text.Encoding]::UTF8.GetBytes($(if ($JsonBody) { $JsonBody } else { '' }))
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
    $stream.Close()
  }
  try {
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $text = $reader.ReadToEnd()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return @{ Status = $code; Body = $text }
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if (-not $resp) { Fail "$Method $Path exception $($_.Exception.Message)" }
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $text = $reader.ReadToEnd()
    $code = [int]$resp.StatusCode
    return @{ Status = $code; Body = $text }
  }
}

function Assert-Status([hashtable]$Response, [int]$Status, [string]$Detail) {
  if ($Response.Status -ne $Status) {
    Fail "$Detail expected HTTP $Status got $($Response.Status) body $($Response.Body)"
  }
}

function Assert-Code([hashtable]$Response, [int]$Status, [string]$Code, [string]$Detail) {
  Assert-Status $Response $Status $Detail
  $parsed = $null
  try { $parsed = $Response.Body | ConvertFrom-Json } catch { Fail "$Detail body is not JSON $($Response.Body)" }
  if ($parsed.code -ne $Code) {
    Fail "$Detail expected code $Code got $($parsed.code) body $($Response.Body)"
  }
}

function Wait-PostCount([int]$Count, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if ($script:shared.posts.Count -ge $Count) { return $true }
    Start-Sleep -Milliseconds 100
  }
  return $false
}

try {
  Write-Output 'CASE autotest routes hidden'
  Start-Adapter -TimeoutSeconds 1800 -RetryMs 0 -Autotest $false
  $health = Invoke-Api 'GET' '/api/measurement/health' $null
  Assert-Status $health 200 'health'
  $healthJson = $health.Body | ConvertFrom-Json
  if ($healthJson.status -ne 'ok' -or $healthJson.standardRevision -ne '2026-10-10') {
    Fail "health body $($health.Body)"
  }
  $before = Invoke-Api 'GET' '/api/measurement/logs' $null
  $health2 = Invoke-Api 'GET' '/api/measurement/health' $null
  $after = Invoke-Api 'GET' '/api/measurement/logs' $null
  Assert-Status $health2 200 'health again'
  $beforeCount = ($before.Body | ConvertFrom-Json).count
  $afterCount = ($after.Body | ConvertFrom-Json).count
  if ($beforeCount -ne $afterCount) { Fail "health wrote a log before=$beforeCount after=$afterCount" }
  $hidden = Invoke-Api 'POST' '/api/measurement/test/collect' '{"taskId":"x","code":"y"}'
  Assert-Status $hidden 404 'test route without autotest'
  Write-Output 'OK hidden test route and health'

  Write-Output 'CASE validation and submit'
  Start-CallbackListener
  Start-Adapter -TimeoutSeconds 1800 -RetryMs 0 -Autotest $true
  $noCb = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"t-nocb","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'
  Assert-Code $noCb 400 'CALLBACK_NOT_REGISTERED' 'missing callback'
  $emptyCb = Invoke-Api 'PUT' '/api/measurement/callback' '{"callbackUrl":""}'
  Assert-Code $emptyCb 400 'CALLBACK_URL_EMPTY' 'empty callback'
  $missingCb = Invoke-Api 'PUT' '/api/measurement/callback' '{}'
  Assert-Code $missingCb 400 'CALLBACK_URL_EMPTY' 'missing callback field'
  $put = Invoke-Api 'PUT' '/api/measurement/callback' (@{ callbackUrl = $script:callbackUrl } | ConvertTo-Json -Compress)
  Assert-Status $put 200 'register callback'
  $got = Invoke-Api 'GET' '/api/measurement/callback' $null
  Assert-Status $got 200 'read callback'
  $gotJson = $got.Body | ConvertFrom-Json
  if ($gotJson.callbackUrl -ne $script:callbackUrl) { Fail "callback url mismatch $($got.Body)" }

  $cases = @(
    @{ Body = '{"deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'; Code = 'TASK_ID_EMPTY'; Name = 'missing taskId' },
    @{ Body = '{"taskId":"","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'; Code = 'TASK_ID_EMPTY'; Name = 'empty taskId' },
    @{ Body = '{"taskId":"t-unknown-device","deviceType":"not_a_device","params":[{"code":"inner_diameter"}]}'; Code = 'DEVICE_TYPE_UNKNOWN'; Name = 'unknown device' },
    @{ Body = '{"taskId":"t-empty-params","deviceType":"handheld_cmm","params":[]}'; Code = 'PARAMS_EMPTY'; Name = 'empty params' },
    @{ Body = '{"taskId":"t-unknown-code","deviceType":"handheld_cmm","params":[{"code":"not_a_param"}]}'; Code = 'PARAM_UNKNOWN'; Name = 'unknown code' },
    @{ Body = '{"taskId":"t-dup-code","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"},{"code":"inner_diameter"}]}'; Code = 'PARAM_DUPLICATED'; Name = 'duplicate code' }
  )
  foreach ($case in $cases) {
    $resp = Invoke-Api 'POST' '/api/measurement/tasks' $case.Body
    Assert-Code $resp 400 $case.Code $case.Name
  }

  $taskBody = @{
    taskId = 'task-cmm-1'
    deviceType = 'handheld_cmm'
    params = @(
      @{ code = 'inner_diameter'; requirement = @{ nominal = 50.0; upper = 0.02; lower = -0.02 } },
      @{ code = 'roundness'; requirement = @{ upper = 0.015 } },
      @{ code = 'cylindricity'; requirement = @{ upper = 0.02 } }
    )
    context = @{ bizRef = 'L5-142.1.1' }
  } | ConvertTo-Json -Compress -Depth 6
  $accepted = Invoke-Api 'POST' '/api/measurement/tasks' $taskBody
  Assert-Status $accepted 200 'accept cmm'
  $acceptedJson = $accepted.Body | ConvertFrom-Json
  if ($acceptedJson.taskId -ne 'task-cmm-1' -or $acceptedJson.deviceType -ne 'handheld_cmm') {
    Fail "accept echo $($accepted.Body)"
  }

  $busy = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-cmm-2","deviceType":"handheld_cmm","params":[{"code":"length"}]}'
  Assert-Code $busy 400 'PARAM_UNKNOWN' 'micrometer code on cmm'
  $dup = Invoke-Api 'POST' '/api/measurement/tasks' $taskBody
  Assert-Code $dup 409 'TASK_DUPLICATED' 'duplicate task id'

  $limitDefault = Invoke-Api 'GET' '/api/measurement/logs' $null
  Assert-Status $limitDefault 200 'logs default'
  $limitDefaultJson = $limitDefault.Body | ConvertFrom-Json
  if ($limitDefaultJson.limit -ne 100 -or $limitDefaultJson.retainedMax -ne 1000) {
    Fail "default limit body $($limitDefault.Body)"
  }
  foreach ($badLimit in @('0', '1001', 'abc', '1.5')) {
    $limitResp = Invoke-Api 'GET' "/api/measurement/logs?limit=$badLimit" $null
    Assert-Code $limitResp 400 'LIMIT_OUT_OF_RANGE' "limit $badLimit"
  }
  $limit200 = Invoke-Api 'GET' '/api/measurement/logs?limit=200' $null
  Assert-Status $limit200 200 'limit 200'
  if (($limit200.Body | ConvertFrom-Json).limit -ne 200) { Fail "limit 200 body $($limit200.Body)" }

  foreach ($code in @('inner_diameter', 'roundness', 'cylindricity')) {
    $collect = Invoke-Api 'POST' '/api/measurement/test/collect' (@{ taskId = 'task-cmm-1'; code = $code } | ConvertTo-Json -Compress)
    Assert-Status $collect 200 "collect $code"
  }
  $view = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-cmm-1' $null
  Assert-Status $view 200 'view after collect'
  $viewJson = $view.Body | ConvertFrom-Json
  if ($viewJson.items.Count -ne 3) { Fail "expected 3 items $($view.Body)" }
  foreach ($item in $viewJson.items) {
    if (-not $item.collected) { Fail "item not collected $($item.code)" }
  }
  $roundnessBefore = $viewJson.items[1].value
  $cylindricityBefore = $viewJson.items[2].value
  $innerBefore = $viewJson.items[0].value
  $retest = Invoke-Api 'POST' '/api/measurement/test/retest' '{"taskId":"task-cmm-1","code":"inner_diameter"}'
  Assert-Status $retest 200 'retest inner'
  $view2 = (Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-cmm-1' $null).Body | ConvertFrom-Json
  if ($view2.items[0].value -eq $innerBefore) { Fail 'retest did not change inner_diameter' }
  if ($view2.items[1].value -ne $roundnessBefore) { Fail 'retest changed roundness' }
  if ($view2.items[2].value -ne $cylindricityBefore) { Fail 'retest changed cylindricity' }

  $clear = Invoke-Api 'POST' '/api/measurement/test/clear' '{"taskId":"task-cmm-1"}'
  Assert-Status $clear 200 'clear all'
  $view3 = (Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-cmm-1' $null).Body | ConvertFrom-Json
  foreach ($item in $view3.items) {
    if ($item.collected) { Fail "cleared item still collected $($item.code)" }
  }

  Clear-Posts
  foreach ($code in @('inner_diameter', 'roundness', 'cylindricity')) {
    $collect = Invoke-Api 'POST' '/api/measurement/test/collect' (@{ taskId = 'task-cmm-1'; code = $code } | ConvertTo-Json -Compress)
    Assert-Status $collect 200 "recollect $code"
  }
  $submit = Invoke-Api 'POST' '/api/measurement/test/submit' '{"taskId":"task-cmm-1"}'
  Assert-Status $submit 200 'submit cmm'
  if (-not (Wait-PostCount 1 5)) { Fail 'callback was not received' }
  $rawPosts = @($script:shared.posts)
  $cmmRaw = $null
  foreach ($post in $rawPosts) {
    $parsedPost = $post | ConvertFrom-Json
    if ($parsedPost.taskId -eq 'task-cmm-1') { $cmmRaw = $post; break }
  }
  if (-not $cmmRaw) { Fail "no callback for task-cmm-1 posts=$($rawPosts -join ' || ')" }
  $cmm = $cmmRaw | ConvertFrom-Json
  if ($cmm.status -ne 'completed') { Fail "status $($cmm.status)" }
  if ($cmm.standardRevision -ne '2026-10-10') { Fail 'standardRevision' }
  if ($cmm.deviceType -ne 'handheld_cmm') { Fail 'deviceType callback' }
  if ($cmm.context.bizRef -ne 'L5-142.1.1') { Fail "context $($cmmRaw)" }
  if ($null -ne $cmm.error) { Fail "error should be null $($cmmRaw)" }
  if ($cmm.results.Count -ne 3) { Fail "results length $($cmm.results.Count)" }
  if ($cmm.results[0].code -ne 'inner_diameter' -or $cmm.results[1].code -ne 'roundness' -or $cmm.results[2].code -ne 'cylindricity') {
    Fail "result order $($cmmRaw)"
  }
  if ($cmm.results[0].name -ne '内径' -or $cmm.results[0].valueType -ne 'number' -or $cmm.results[0].unit -ne 'mm') {
    Fail "inner fields $($cmmRaw)"
  }
  if ([math]::Abs($cmm.results[0].requirement.nominal - 50.0) -gt 0.0001) { Fail 'nominal not preserved' }
  if ([math]::Abs($cmm.results[0].requirement.lower - (-0.02)) -gt 0.0001) { Fail 'lower not preserved' }
  if ([math]::Abs($cmm.results[1].requirement.upper - 0.015) -gt 0.0001) { Fail 'roundness requirement' }

  $gone = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-cmm-1' $null
  Assert-Status $gone 404 'task removed after callback'
  $again = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-cmm-4","deviceType":"handheld_cmm","params":[{"code":"coaxiality"}]}'
  Assert-Status $again 200 'device free after callback'

  Clear-Posts
  $imageTask = '{"taskId":"task-endo-1","deviceType":"endoscope","params":[{"code":"snapshot"}]}'
  $imageAccept = Invoke-Api 'POST' '/api/measurement/tasks' $imageTask
  Assert-Status $imageAccept 200 'accept endoscope'
  $imageCollect = Invoke-Api 'POST' '/api/measurement/test/collect' '{"taskId":"task-endo-1","code":"snapshot"}'
  Assert-Status $imageCollect 200 'collect snapshot'
  $imageSubmit = Invoke-Api 'POST' '/api/measurement/test/submit' '{"taskId":"task-endo-1"}'
  Assert-Status $imageSubmit 200 'submit endoscope'
  if (-not (Wait-PostCount 1 5)) { Fail 'image callback missing' }
  $imageRaw = $null
  foreach ($post in @($script:shared.posts)) {
    $parsedPost = $post | ConvertFrom-Json
    if ($parsedPost.taskId -eq 'task-endo-1') { $imageRaw = $post; break }
  }
  if (-not $imageRaw) { Fail 'image callback body missing' }
  if ($imageRaw -notmatch '"value"\s*:\s*\[') { Fail "image value is not an array $imageRaw" }
  if ($imageRaw -notmatch '"mimeType"\s*:\s*"image/jpeg"') { Fail 'mimeType missing' }
  if ($imageRaw -notmatch '"fileName"') { Fail 'fileName missing' }
  if ($imageRaw -notmatch '"contentBase64"\s*:\s*"/9j/') { Fail 'contentBase64 missing' }
  if ($imageRaw -match 'data:') { Fail 'contentBase64 has a data prefix' }

  $logs = Invoke-Api 'GET' '/api/measurement/logs?limit=1000' $null
  Assert-Status $logs 200 'logs after success'
  if ($logs.Body -match 'contentBase64' -or $logs.Body -match '/9j/' -or $logs.Body -match '"value"') {
    Fail "logs contain measurement values $($logs.Body)"
  }
  $logJson = $logs.Body | ConvertFrom-Json
  $sawAccepted = $false
  $sawCompleted = $false
  foreach ($row in @($logJson.logs)) {
    if ($row.taskId -eq 'task-cmm-1' -and $row.outcome -eq 'accepted') { $sawAccepted = $true }
    if ($row.taskId -eq 'task-cmm-1' -and $row.outcome -eq 'completed') { $sawCompleted = $true }
  }
  if (-not $sawAccepted -or -not $sawCompleted) { Fail "missing accepted/completed logs $($logs.Body)" }
  $logFile = Join-Path (Split-Path -Parent $script:exe) 'measurement-adapter.log'
  if (-not (Test-Path $logFile)) { Fail 'log file missing' }
  $logText = [IO.File]::ReadAllText($logFile)
  if ($logText -notmatch 'task-cmm-1') { Fail 'log file missing task' }
  if ($logText -match 'contentBase64' -or $logText -match '/9j/') { Fail 'log file contains measurement image' }
  Write-Output 'OK validation collect retest clear submit image logs'

  Write-Output 'CASE overwrite mode'
  $ow1 = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-ow-1","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'
  Assert-Status $ow1 200 'overwrite first'
  $ow2 = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-ow-2","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'
  Assert-Status $ow2 200 'overwrite second'
  $owGone = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-ow-1' $null
  Assert-Status $owGone 404 'overwrite dropped previous'
  $owKept = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-ow-2' $null
  Assert-Status $owKept 200 'overwrite kept latest'
  $owOther = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-ow-3","deviceType":"digital_micrometer","params":[{"code":"outer_diameter"}]}'
  Assert-Status $owOther 200 'overwrite other device replaces'
  $owGone2 = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-ow-2' $null
  Assert-Status $owGone2 404 'overwrite dropped other device task'
  $owDup = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-ow-3","deviceType":"digital_micrometer","params":[{"code":"outer_diameter"}]}'
  Assert-Code $owDup 409 'TASK_DUPLICATED' 'overwrite duplicate id'
  Write-Output 'OK overwrite'

  Write-Output 'CASE queue mode'
  Start-CallbackListener
  Start-Adapter -TimeoutSeconds 1800 -RetryMs 0 -Autotest $true -ProcessMode 'queue'
  $putQueue = Invoke-Api 'PUT' '/api/measurement/callback' (@{ callbackUrl = $script:callbackUrl } | ConvertTo-Json -Compress)
  Assert-Status $putQueue 200 'queue callback'
  $q1 = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-q-1","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'
  Assert-Status $q1 200 'queue first'
  $q2 = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-q-2","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'
  Assert-Status $q2 200 'queue same device'
  $q3 = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-q-3","deviceType":"digital_micrometer","params":[{"code":"outer_diameter"}]}'
  Assert-Status $q3 200 'queue other device'
  foreach ($id in @('task-q-1', 'task-q-2', 'task-q-3')) {
    $kept = Invoke-Api 'GET' "/api/measurement/test/task?taskId=$id" $null
    Assert-Status $kept 200 "queue kept $id"
  }
  $qDup = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-q-2","deviceType":"handheld_cmm","params":[{"code":"inner_diameter"}]}'
  Assert-Code $qDup 409 'TASK_DUPLICATED' 'queue duplicate id'
  Write-Output 'OK queue'

  Write-Output 'CASE callback retries'
  Start-CallbackListener
  $script:shared.status = 500
  Start-Adapter -TimeoutSeconds 1800 -RetryMs 50 -Autotest $true
  $putRetry = Invoke-Api 'PUT' '/api/measurement/callback' (@{ callbackUrl = $script:callbackUrl } | ConvertTo-Json -Compress)
  Assert-Status $putRetry 200 'register failing callback'
  $retryAccept = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-retry","deviceType":"camera","params":[{"code":"remark"}]}'
  Assert-Status $retryAccept 200 'accept retry task'
  $retryCollect = Invoke-Api 'POST' '/api/measurement/test/collect' '{"taskId":"task-retry","code":"remark"}'
  Assert-Status $retryCollect 200 'collect remark'
  Clear-Posts
  $retrySubmit = Invoke-Api 'POST' '/api/measurement/test/submit' '{"taskId":"task-retry"}'
  Assert-Status $retrySubmit 200 'submit retry task'
  if (-not (Wait-PostCount 4 10)) { Fail "expected 4 callback attempts got $($script:shared.posts.Count)" }
  $retryPosts = @($script:shared.posts)
  if ($retryPosts.Count -lt 4) { Fail "retry count $($retryPosts.Count)" }
  if ($retryPosts[0] -ne $retryPosts[1] -or $retryPosts[0] -ne $retryPosts[2] -or $retryPosts[0] -ne $retryPosts[3]) {
    Fail 'retry bodies differ'
  }
  $retryKept = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-retry' $null
  Assert-Status $retryKept 200 'retry task kept after delivery failure'
  $retryKeptJson = $retryKept.Body | ConvertFrom-Json
  $retryItem = $retryKeptJson.items
  if ($retryItem -is [System.Array]) { $retryItem = $retryItem[0] }
  if (-not $retryItem.collected) { Fail 'delivery failure cleared the measurement' }
  $retryLogs = (Invoke-Api 'GET' '/api/measurement/logs?limit=20' $null).Body | ConvertFrom-Json
  $sawCallbackFailed = $false
  foreach ($row in @($retryLogs.logs)) {
    if ($row.taskId -eq 'task-retry' -and $row.outcome -eq 'callback_failed') { $sawCallbackFailed = $true }
  }
  if (-not $sawCallbackFailed) { Fail 'missing callback_failed log' }
  $retryNext = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-retry-2","deviceType":"camera","params":[{"code":"remark"}]}'
  Assert-Status $retryNext 200 'device free after callback failure'
  Write-Output 'OK callback retries'

  Write-Output 'CASE timeout'
  Start-CallbackListener
  $script:shared.status = 200
  Start-Adapter -TimeoutSeconds 1 -RetryMs 0 -Autotest $true
  $putTimeout = Invoke-Api 'PUT' '/api/measurement/callback' (@{ callbackUrl = $script:callbackUrl } | ConvertTo-Json -Compress)
  Assert-Status $putTimeout 200 'register timeout callback'
  Clear-Posts
  $timeoutAccept = Invoke-Api 'POST' '/api/measurement/tasks' '{"taskId":"task-timeout","deviceType":"deflection_gauge","params":[{"code":"deflection"}]}'
  Assert-Status $timeoutAccept 200 'accept timeout task'
  if (-not (Wait-PostCount 1 8)) { Fail 'timeout callback missing' }
  $timeoutRaw = $script:shared.posts[0]
  $timeoutJson = $timeoutRaw | ConvertFrom-Json
  if ($timeoutJson.status -ne 'failed' -or $timeoutJson.error.code -ne 'TIMEOUT') {
    Fail "timeout body $timeoutRaw"
  }
  if ($null -ne $timeoutJson.results) { Fail 'timeout results should be null' }
  Start-Sleep -Milliseconds 300
  $timeoutGone = Invoke-Api 'GET' '/api/measurement/test/task?taskId=task-timeout' $null
  Assert-Status $timeoutGone 404 'timeout task removed'
  Write-Output 'OK timeout'
  Write-Output 'ALL PASSED'
  exit 0
} finally {
  Stop-Adapter
  Stop-Callback
}
