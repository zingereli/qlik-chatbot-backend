# ---------------------------------------------------------------------------
# Sets up token-usage monitoring + alerting for the Qlik chatbot backend.
#
# Creates:
#   1. A log-based DISTRIBUTION metric (chatbot_llm_tokens) that extracts
#      jsonPayload.total_tokens from the backend's structured "llm_usage" logs.
#   2. An email notification channel (reused if one already exists).
#   3. An alert policy: fires when total tokens exceed THRESHOLD within WINDOW.
#
# REQUIRES on the running account:
#   roles/logging.configWriter   (create log metric)
#   roles/monitoring.editor      (create channel + policy)
#
# Run:  powershell -ExecutionPolicy Bypass -File setup_alerts.ps1
# Note: ASCII-only on purpose (Windows PowerShell 5.1 mis-parses non-BOM UTF-8).
# ---------------------------------------------------------------------------

# ---- config (edit as needed) ----
$PROJECT   = "modern-bolt-417216"
$EMAIL     = "eliyahuz@opisoft.com"
$THRESHOLD = 200000          # tokens within the alignment window
$WINDOW    = "3600s"         # 1 hour (run-protection guard)
$SERVICE   = "qlik-chatbot-backend"
$GCLOUD    = "C:\Users\eliyahuz-local\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.ps1"
# ----------------------------------

$tok = (& $GCLOUD auth print-access-token 2>$null)
if (-not $tok) { Write-Error "No access token - run 'gcloud auth login' first."; exit 1 }
$hdr = @{ Authorization = "Bearer $tok"; "Content-Type" = "application/json" }
function ErrBody($e){ $r=$e.Exception.Response; if($r){(New-Object System.IO.StreamReader($r.GetResponseStream())).ReadToEnd()}else{$e.Exception.Message} }

# 1) log-based distribution metric
$metric = @{
  name        = "chatbot_llm_tokens"
  description = "Total LLM tokens per call from the Qlik chatbot backend"
  filter      = "resource.type=`"cloud_run_revision`" AND resource.labels.service_name=`"$SERVICE`" AND jsonPayload.event=`"llm_usage`""
  metricDescriptor = @{ metricKind="DELTA"; valueType="DISTRIBUTION"; unit="1" }
  valueExtractor   = "EXTRACT(jsonPayload.total_tokens)"
  bucketOptions    = @{ exponentialBuckets=@{ numFiniteBuckets=64; growthFactor=2; scale=1 } }
}
try { $m=Invoke-RestMethod -Method Post -Uri "https://logging.googleapis.com/v2/projects/$PROJECT/metrics" -Headers $hdr -Body ($metric|ConvertTo-Json -Depth 8); Write-Host "metric ok: $($m.name)" }
catch { $b=ErrBody $_; if($b -match "already exists"){ Write-Host "metric exists (ok)" } else { Write-Host "metric err: $b" } }

# 2) email notification channel (reuse if one with same email exists)
$chanName=$null
try { $ex=Invoke-RestMethod -Method Get -Uri "https://monitoring.googleapis.com/v3/projects/$PROJECT/notificationChannels" -Headers $hdr
      $chanName=($ex.notificationChannels|Where-Object{$_.labels.email_address -eq $EMAIL}|Select-Object -First 1).name } catch {}
if (-not $chanName) {
  $chan=@{ type="email"; displayName="Chatbot token alerts"; labels=@{ email_address=$EMAIL }; enabled=$true }
  try { $c=Invoke-RestMethod -Method Post -Uri "https://monitoring.googleapis.com/v3/projects/$PROJECT/notificationChannels" -Headers $hdr -Body ($chan|ConvertTo-Json -Depth 6); $chanName=$c.name; Write-Host "channel ok: $chanName" }
  catch { Write-Host "channel err: $(ErrBody $_)"; exit 1 }
} else { Write-Host "channel reused: $chanName" }

# 3) alert policy (retries: a new log metric can take up to ~10 min to register)
# A DISTRIBUTION metric can't be thresholded directly via ALIGN_SUM, so we use a
# PromQL condition that sums the metric's _sum component over the window.
$promql = "sum(increase(logging_googleapis_com:user_chatbot_llm_tokens_sum[1h])) > $THRESHOLD"
$pol=@{ displayName="Chatbot LLM tokens - hourly guard"; combiner="OR"
  conditions=@(@{ displayName="Tokens > $THRESHOLD in $WINDOW"
    conditionPrometheusQueryLanguage=@{ query=$promql; duration="0s"; evaluationInterval="300s" } })
  notificationChannels=@($chanName); alertStrategy=@{ autoClose="604800s" } }
$ok=$false
for($i=1; $i -le 12; $i++){
  try { $p=Invoke-RestMethod -Method Post -Uri "https://monitoring.googleapis.com/v3/projects/$PROJECT/alertPolicies" -Headers $hdr -Body ($pol|ConvertTo-Json -Depth 12); Write-Host "policy ok: $($p.name)"; $ok=$true; break }
  catch { $b=ErrBody $_; if($b -match "Cannot find metric"){ Write-Host "attempt ${i}: metric not ready, waiting 60s..."; Start-Sleep -Seconds 60 } else { Write-Host "policy err: $b"; break } }
}
if(-not $ok){ Write-Host "policy not created within retries - run this script again in a few minutes." }
Write-Host "Done. Alerts email $EMAIL when chatbot tokens exceed $THRESHOLD within $WINDOW."