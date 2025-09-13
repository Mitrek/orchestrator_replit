# ===================================================================
# Heatmap Core Smoketest (desktop) — AI + Data routes
# PowerShell 5.1+
# ===================================================================
# Env (optional):
#   HEATMAP_BASE    -> https://your-api
#   HEATMAP_KEY     -> Bearer token
#   HEATMAP_URL     -> URL to screenshot
#   HEATMAP_JSONL   -> Path to .jsonl (one JSON object per line)
#   HEATMAP_OPEN    -> "1" to auto-open the saved PNGs
#   HEATMAP_NOCACHE -> "1" to bypass server cache (query + header)
# ===================================================================

# ---- Config ----
$BASE   = if ($env:HEATMAP_BASE)   { $env:HEATMAP_BASE }   else { "https://60018a49-32e3-45ec-92e9-e671294eff18-00-2ctgykht9dlk2.spock.replit.dev" }
$KEY    = if ($env:HEATMAP_KEY)    { $env:HEATMAP_KEY }    else { "cimple_baf6fe15_nkBbMS9-tpFqGQy8pPsMflBzZK_TLp30" }
$URL    = if ($env:HEATMAP_URL)    { $env:HEATMAP_URL }    else { "https://knightsoftheworkflow.netlify.app/" }
$JSONL  = if ($env:HEATMAP_JSONL)  { $env:HEATMAP_JSONL }  else { Join-Path $PWD "sample.jsonl" }
$OPEN   = ($env:HEATMAP_OPEN -eq "1")
$NOCACHE= ($env:HEATMAP_NOCACHE -eq "1")

$OUTDIR = Join-Path $PWD 'smoke-out'
New-Item -ItemType Directory -Path $OUTDIR -Force | Out-Null

# Thresholds
$MIN_OK_BYTES = 12000    # under this, image is suspiciously tiny
$SLOW_MS      = 15000

Write-Host ("BASE    = " + $BASE)
Write-Host ("URL     = " + $URL)
Write-Host ("JSONL   = " + $JSONL)
Write-Host ("OPEN    = " + $OPEN)
Write-Host ("NOCACHE = " + $NOCACHE)

# ---- Helpers ----
function Slugify([string]$Text) {
  $t = ($Text -replace '^(https?|ftp)://','').ToLower()
  $slug = ($t -replace '[^a-z0-9]+','-').Trim('-')
  if ([string]::IsNullOrEmpty($slug)) { $slug = "site" }
  if ($slug.Length -gt 80) { $slug = $slug.Substring(0,80) }
  return $slug
}

function Save-DataUriToPng([string]$DataUri, [string]$OutPath) {
  if ($DataUri -notmatch '^data:image/[a-zA-Z0-9.+-]+;base64,') { throw "INVALID_DATA_URI" }
  $b64 = $DataUri -replace '^data:image/[a-zA-Z0-9.+-]+;base64,',''
  [IO.File]::WriteAllBytes($OutPath, [Convert]::FromBase64String($b64))
  return (Get-Item $OutPath).Length
}

function Invoke-JsonPost([string]$Uri, [hashtable]$Body) {
  $json = $Body | ConvertTo-Json -Depth 50
  $headers = @{ "content-type" = "application/json" }
  if ($KEY)     { $headers["authorization"] = "Bearer $KEY" }
  if ($NOCACHE) { $headers["x-hm-nocache"] = "1" }
  try {
    $resp = Invoke-WebRequest -Uri $Uri -Method POST -Headers $headers -Body $json -ErrorAction Stop
    [pscustomobject]@{ StatusCode=200; Body = ($resp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue); Raw=$resp.Content }
  } catch {
    $status = $null; $raw = $null
    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      try {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $raw = $sr.ReadToEnd(); $sr.Close()
      } catch {}
    }
    [pscustomobject]@{ StatusCode=$status; Body = ($(try { $raw | ConvertFrom-Json -ErrorAction SilentlyContinue } catch { $null })); Raw=$raw }
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
          $x = if ($null -ne $ck.x_percent) { [double]$ck.x_percent } elseif ($null -ne $ck.x) { [double]$ck.x } else { 0 }
          $y = if ($null -ne $ck.y_percent) { [double]$ck.y_percent } elseif ($null -ne $ck.y) { [double]$ck.y } else { 0 }
          $x = [Math]::Max(0,[Math]::Min(1,$x)); $y = [Math]::Max(0,[Math]::Min(1,$y))
          $points.Add(@{ x=$x; y=$y; type="click" })
        }
      }
      if ($obj.moves) {
        foreach ($mv in $obj.moves) {
          $x2 = if ($null -ne $mv.x_percent) { [double]$mv.x_percent } elseif ($null -ne $mv.x) { [double]$mv.x } else { 0 }
          $y2 = if ($null -ne $mv.y_percent) { [double]$mv.y_percent } elseif ($null -ne $mv.y) { [double]$mv.y } else { 0 }
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

function AddNoCacheQuery([string]$u) {
  if (-not $NOCACHE) { return $u }
  if ($u -match '\?') {
    return ($u + "&nocache=1")
  } else {
    return ($u + "?nocache=1")
  }
}

$slug = Slugify $URL

# ---------------- AI route ----------------
Write-Host "`n[AI] /api/v1/heatmap" -ForegroundColor Cyan
$aiBody = @{ url = (AddNoCacheQuery $URL); device = "desktop" }
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$aiResp = Invoke-JsonPost ($BASE.TrimEnd('/') + "/api/v1/heatmap") $aiBody
$sw.Stop()

$aiStatus = $aiResp.StatusCode
$aiObj = $aiResp.Body
$aiValid = $false; $aiBytes = 0; $aiPath = $null; $aiEngine = ""; $aiReqId = ""

if ($aiStatus -eq 200 -and $aiObj) {
  $b64 = $aiObj.base64
  $aiEngine = [string]$aiObj.meta.engine
  $aiReqId  = [string]$aiObj.meta.reqId
  if ($b64 -and ($b64 -match '^data:image/[a-zA-Z0-9.+-]+;base64,')) {
    $aiValid = $true
    $aiPath = Join-Path $OUTDIR ("{0}_desktop_ai.png" -f $slug)
    try { $aiBytes = Save-DataUriToPng $b64 $aiPath } catch { $aiValid = $false }
  }
}
$aiClass = Classify -Http $aiStatus -ValidB64 $aiValid -Bytes $aiBytes -Engine $aiEngine -Ms $sw.ElapsedMilliseconds
Write-Host ("{0,-6}  {1}B  {2}ms  engine={3}  reqId={4}" -f $aiClass[0], $aiBytes, $sw.ElapsedMilliseconds, $aiEngine, $aiReqId) `
  -ForegroundColor (@{OK="Green";WARN="Yellow";FAIL="Red"}[$aiClass[0]])
if ($OPEN -and $aiValid) { Start-Process $aiPath }

# ---------------- Data route ----------------
Write-Host "`n[DATA] /api/v1/heatmap/data" -ForegroundColor Cyan
$lines = Read-Jsonl -Path $JSONL
Write-Host ("Read {0} JSONL line(s)" -f $lines.Count)
$points = Convert-JsonlTo-DataPoints -Lines $lines
if ($points.Count -eq 0) { Write-Host "No valid points parsed from JSONL." -ForegroundColor Red; exit 1 }

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
$dataValid = $false; $dataBytes = 0; $dataPath = $null; $dataEngine = ""; $dataReqId = ""

if ($dataStatus -eq 200 -and $dataObj) {
  $b64 = $dataObj.base64
  $dataEngine = [string]$dataObj.meta.engine
  $dataReqId  = [string]$dataObj.meta.reqId
  if ($b64 -and ($b64 -match '^data:image/[a-zA-Z0-9.+-]+;base64,')) {
    $dataValid = $true
    $dataPath = Join-Path $OUTDIR ("{0}_desktop_data.png" -f $slug)
    try { $dataBytes = Save-DataUriToPng $b64 $dataPath } catch { $dataValid = $false }
  }
}
$dataClass = Classify -Http $dataStatus -ValidB64 $dataValid -Bytes $dataBytes -Engine $dataEngine -Ms $sw2.ElapsedMilliseconds
Write-Host ("{0,-6}  {1}B  {2}ms  engine={3}  reqId={4}" -f $dataClass[0], $dataBytes, $sw2.ElapsedMilliseconds, $dataEngine, $dataReqId) `
  -ForegroundColor (@{OK="Green";WARN="Yellow";FAIL="Red"}[$dataClass[0]])
if ($OPEN -and $dataValid) { Start-Process $dataPath }

# ---------------- Summary & exit code ----------------
$ok = 0; $warn = 0; $fail = 0
foreach ($c in @($aiClass[0], $dataClass[0])) {
  switch ($c) { "OK" { $ok++ } "WARN" { $warn++ } default { $fail++ } }
}
Write-Host "`n[SUMMARY] OK: $ok  WARN: $warn  FAIL: $fail" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 } else { exit 0 }
