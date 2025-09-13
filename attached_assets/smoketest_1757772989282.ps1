# ===================================================================
# Heatmap Core Smoketest — AI + Data (desktop)
# PowerShell 5.1+
# ===================================================================
# Env (optional):
#   HEATMAP_BASE     -> https://your-api
#   HEATMAP_KEY      -> Bearer token
#   HEATMAP_URL      -> URL to screenshot
#   HEATMAP_JSONL    -> Path to .jsonl (one JSON object per line)
#   HEATMAP_OPEN     -> "1" to auto-open saved PNGs (default: 0)
#   HEATMAP_NOCACHE  -> "0" to allow cache (default: 1 = bust cache)
# ===================================================================

# ---- Config ----
$BASE    = if ($env:HEATMAP_BASE)    { $env:HEATMAP_BASE }    else { "https://YOUR-API" }
$KEY     = if ($env:HEATMAP_KEY)     { $env:HEATMAP_KEY }     else { "cimple_48684a70_nbbXIc8_ZU6ux7KtNFRu0Rw5kmqOGWoa" }
$URL     = if ($env:HEATMAP_URL)     { $env:HEATMAP_URL }     else { "https://knightsoftheworkflow.netlify.app/" }
$JSONL   = if ($env:HEATMAP_JSONL)   { $env:HEATMAP_JSONL }   else { Join-Path $PWD "sample.jsonl" }
$OPEN    = ($env:HEATMAP_OPEN -eq "1")
$BUST    = ($env:HEATMAP_NOCACHE -ne "0")   # default true

$OUTDIR  = Join-Path $PWD 'smoke-out'
New-Item -ItemType Directory -Path $OUTDIR -Force | Out-Null
$TS      = (Get-Date).ToString("yyyyMMdd-HHmmss")

# Thresholds
$MIN_OK_BYTES = 12000    # warn if output PNG smaller than this (~12 KB)
$SLOW_MS      = 15000    # warn if over this

Write-Host "BASE     = $BASE"
Write-Host "URL      = $URL"
Write-Host "JSONL    = $JSONL"
Write-Host "OPEN     = $OPEN"
Write-Host "BUSTCACHE= $BUST"

# ---- Helpers ----
function Slugify([string]$Text) {
  $t = ($Text -replace '^(https?|ftp):\/\/','').ToLower()
  $slug = ($t -replace '[^a-z0-9]+','-').Trim('-')
  if ([string]::IsNullOrEmpty($slug)) { $slug = "site" }
  if ($slug.Length -gt 80) { $slug = $slug.Substring(0,80) }
  return $slug
}

function AddNoCacheQuery([string]$u) {
  if (-not $BUST) { return $u }
  $sep = ($u -match '\?') ? '&' : '?'
  return ($u + $sep + "nocache=1&t=" + [guid]::NewGuid().ToString("N").Substring(0,8))
}

function To-Json([object]$o, [int]$depth=50) { $o | ConvertTo-Json -Depth $depth }

function Save-DataUriToPng([string]$DataUri, [string]$OutPath) {
  if ($DataUri -notmatch '^data:image\/[a-zA-Z0-9.+-]+;base64,') { throw "INVALID_DATA_URI" }
  $b64 = $DataUri -replace '^data:image\/[a-zA-Z0-9.+-]+;base64,',''
  [IO.File]::WriteAllBytes($OutPath, [Convert]::FromBase64String($b64))
  return (Get-Item $OutPath).Length
}

function Invoke-JsonPost([string]$Uri, [hashtable]$Body) {
  $json = $Body | ConvertTo-Json -Depth 50
  $headers = @{ "content-type" = "application/json" }
  if ($KEY)  { $headers["authorization"] = "Bearer $KEY" }
  if ($BUST) { $headers["x-hm-nocache"] = "1" }

  try {
    $resp = Invoke-WebRequest -Uri $Uri -Method POST -Headers $headers -Body $json -ErrorAction Stop
    [pscustomobject]@{
      StatusCode = 200
      Body = if ($resp.Content) { $resp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue } else { $null }
      Raw  = $resp.Content
    }
  } catch {
    $status = $null; $raw = $null
    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      try {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $raw = $sr.ReadToEnd(); $sr.Close()
      } catch {}
    }
    [pscustomobject]@{
      StatusCode = $status
      Body = if ($raw) { try { $raw | ConvertFrom-Json -ErrorAction SilentlyContinue } catch { $null } } else { $null }
      Raw  = $raw
    }
  }
}

function Read-Jsonl([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "JSONL file not found: $Path" }
  (Get-Content -LiteralPath $Path -Encoding UTF8) | Where-Object { $_ -and $_.Trim().Length -gt 0 }
}

function Convert-JsonlTo-DataPoints([string[]]$Lines) {
  $points = New-Object System.Collections.Generic.List[object]
  foreach ($line in $Lines) {
    try {
      $obj = $line | ConvertFrom-Json -ErrorAction Stop
      if ($obj.clicks) {
        foreach ($ck in $obj.clicks) {
          $x = if ($ck.x_percent -ne $null) { [double]$ck.x_percent } elseif ($ck.x -ne $null) { [double]$ck.x } else { 0 }
          $y = if ($ck.y_percent -ne $null) { [double]$ck.y_percent } elseif ($ck.y -ne $null) { [double]$ck.y } else { 0 }
          $x = [Math]::Max(0,[Math]::Min(1,$x)); $y = [Math]::Max(0,[Math]::Min(1,$y))
          $points.Add(@{ x=$x; y=$y; type="click" })
        }
      }
      if ($obj.moves) {
        foreach ($mv in $obj.moves) {
          $x2 = if ($mv.x_percent -ne $null) { [double]$mv.x_percent } elseif ($mv.x -ne $null) { [double]$mv.x } else { 0 }
          $y2 = if ($mv.y_percent -ne $null) { [double]$mv.y_percent } elseif ($mv.y -ne $null) { [double]$mv.y } else { 0 }
          $x2 = [Math]::Max(0,[Math]::Min(1,$x2)); $y2 = [Math]::Max(0,[Math]::Min(1,$y2))
          $points.Add(@{ x=$x2; y=$y2; type="move" })
        }
      }
    } catch { }
  }
  return ,$points
}

function Classify([int]$Http, [bool]$ValidB64, [long]$Bytes, [string]$Engine, [long]$Ms) {
  if ($Http -ne 200) { return @("FAIL","HTTP_"+$Http) }
  if (-not $ValidB64) { return @("FAIL","INVALID_DATA_URI") }
  if ($Bytes -lt $MIN_OK_BYTES) { return @("WARN","TINY_IMAGE") }
  if ($Ms -gt $SLOW_MS) { return @("WARN","SLOW_RENDER") }
  if ($Engine -and ($Engine -notin @("ai","data"))) { return @("WARN","ENGINE_"+$Engine) }
  return @("OK","NORMAL")
}

# ---- Run both endpoints ----
$slug = Slugify $URL

# === AI ===
Write-Host "`n[AI] /api/v1/heatmap" -ForegroundColor Cyan
$aiBody = @{ url = (AddNoCacheQuery $URL); device = "desktop" }
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$aiResp = Invoke-JsonPost ($BASE.TrimEnd('/') + "/api/v1/heatmap") $aiBody
$sw.Stop()

$aiStatus = $aiResp.StatusCode
$aiObj = $aiResp.Body
$aiValid = $false; $aiBytes = 0; $aiEngine = ""; $aiReqId = ""; $aiPath = $null

if ($aiStatus -eq 200 -and $aiObj) {
  $b64 = $aiObj.base64
  $aiEngine = [string]$aiObj.meta.engine
  if ($aiObj.meta.reqId) { $aiReqId = [string]$aiObj.meta.reqId }
  if ($b64 -and ($b64 -match '^data:image\/[a-zA-Z0-9.+-]+;base64,')) {
    $aiValid = $true
    $aiPath = Join-Path $OUTDIR ("{0}_{1}_desktop_ai.png" -f $slug, $TS)
    try { $aiBytes = Save-DataUriToPng $b64 $aiPath } catch { $aiValid = $false }
    if ($aiValid) {
      $metaPath = [IO.Path]::ChangeExtension($aiPath, ".meta.json")
      $aiObj.meta | To-Json | Set-Content -LiteralPath $metaPath -Encoding UTF8
    }
  }
}
$aiClass = Classify -Http $aiStatus -ValidB64 $aiValid -Bytes $aiBytes -Engine $aiEngine -Ms $sw.ElapsedMilliseconds
Write-Host ("{0,-6}  {1}B  {2}ms  engine={3}  reqId={4}" -f $aiClass[0], $aiBytes, $sw.ElapsedMilliseconds, $aiEngine, $aiReqId) `
  -ForegroundColor (@{OK="Green";WARN="Yellow";FAIL="Red"}[$aiClass[0]])
if ($aiClass[0] -eq "FAIL" -and $aiResp.Raw) {
  $snippet = $aiResp.Raw; if ($snippet.Length -gt 800) { $snippet = $snippet.Substring(0,800) }
  Write-Host $snippet -ForegroundColor DarkGray
}
if ($OPEN -and $aiValid) { Start-Process $aiPath }

# === DATA ===
Write-Host "`n[DATA] /api/v1/heatmap/data" -ForegroundColor Cyan
$lines = Read-Jsonl -Path $JSONL
Write-Host ("Read {0} JSONL line(s)" -f $lines.Count)
$points = Convert-JsonlTo-DataPoints -Lines $lines
if ($points.Count -eq 0) {
  Write-Host "No valid points parsed from JSONL." -ForegroundColor Red
  exit 1
}

$dataBody = @{
  url = (AddNoCacheQuery $URL)
  device = "desktop"
  dataPoints = $points
}
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$dataResp = Invoke-JsonPost ($BASE.TrimEnd('/') + "/api/v1/heatmap/data") $dataBody
$sw2.Stop()

$dataStatus = $dataResp.StatusCode
$dataObj = $dataResp.Body
$dataValid = $false; $dataBytes = 0; $dataEngine = ""; $dataReqId = ""; $dataPath = $null

if ($dataStatus -eq 200 -and $dataObj) {
  $b64 = $dataObj.base64
  $dataEngine = [string]$dataObj.meta.engine
  if ($dataObj.meta.reqId) { $dataReqId = [string]$dataObj.meta.reqId }
  if ($b64 -and ($b64 -match '^data:image\/[a-zA-Z0-9.+-]+;base64,')) {
    $dataValid = $true
    $dataPath = Join-Path $OUTDIR ("{0}_{1}_desktop_data.png" -f $slug, $TS)
    try { $dataBytes = Save-DataUriToPng $b64 $dataPath } catch { $dataValid = $false }
    if ($dataValid) {
      $metaPath = [IO.Path]::ChangeExtension($dataPath, ".meta.json")
      $dataObj.meta | To-Json | Set-Content -LiteralPath $metaPath -Encoding UTF8
    }
  }
}
$dataClass = Classify -Http $dataStatus -ValidB64 $dataValid -Bytes $dataBytes -Engine $dataEngine -Ms $sw2.ElapsedMilliseconds
Write-Host ("{0,-6}  {1}B  {2}ms  engine={3}  reqId={4}" -f $dataClass[0], $dataBytes, $sw2.ElapsedMilliseconds, $dataEngine, $dataReqId) `
  -ForegroundColor (@{OK="Green";WARN="Yellow";FAIL="Red"}[$dataClass[0]])
if ($dataClass[0] -eq "FAIL" -and $dataResp.Raw) {
  $snippet = $dataResp.Raw; if ($snippet.Length -gt 800) { $snippet = $snippet.Substring(0,800) }
  Write-Host $snippet -ForegroundColor DarkGray
}
if ($OPEN -and $dataValid) { Start-Process $dataPath }

# === Summary ===
$ok = 0; $warn = 0; $fail = 0
foreach ($c in @($aiClass[0], $dataClass[0])) { switch ($c) { "OK" { $ok++ } "WARN" { $warn++ } default { $fail++ } } }
Write-Host "`n[SUMMARY] OK: $ok  WARN: $warn  FAIL: $fail" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 } else { exit 0 }
