# Teutonia Prognose: holt Spielplan, Tabelle, Aufstellungen und Liveticker von handball.net (Windows)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$daten = Join-Path $root 'daten'
$cache = Join-Path $daten 'cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$teamFile = Join-Path $daten 'team_id.txt'
$teamId = '86088'
if (Test-Path $teamFile) { $t = (Get-Content $teamFile -Raw) -replace '\D', ''; if ($t) { $teamId = $t } }
$ref = "https://www.handball.net/team/$teamId"
Write-Host "Hole aktuelle Daten von handball.net (Team $teamId) ..."

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$script:c = $null
$script:page = ''
function Neuer-Client {
  $script:c = New-Object System.Net.Http.HttpClient
  $script:c.Timeout = [TimeSpan]::FromSeconds(30)
  $script:c.DefaultRequestHeaders.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36')
  $script:page = $script:c.GetStringAsync($ref).Result
  $token = [regex]::Match($script:page, 'name="client-token" content="([^"]+)"').Groups[1].Value
  if (-not $token) { throw 'Token nicht gefunden' }
  $script:c.DefaultRequestHeaders.Add('x-client-token', $token)
  $script:c.DefaultRequestHeaders.Referrer = New-Object Uri($ref)
}
function Api($pfad) {
  for ($v = 0; $v -lt 2; $v++) {
    $r = $script:c.GetAsync("https://www.handball.net/api/new/$pfad").Result
    $txt = $r.Content.ReadAsStringAsync().Result
    if ($r.IsSuccessStatusCode -and -not $txt.StartsWith('{"error"')) { return $txt }
    Neuer-Client
  }
  throw "Abruf fehlgeschlagen: $pfad"
}

$ok = $false
try {
  Neuer-Client
  $phase = [regex]::Match($script:page, "team/$teamId\?season_id=\d+&amp;phaseId=(\d+)").Groups[1].Value
  if (-not $phase) { throw 'Liga nicht gefunden' }
  $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("window.HB_DATA = {`"teamId`": $teamId, `"phaseId`": $phase, `"fetchedAt`": `"$now`", `"pages`": []};`n")
  $spiele = @()
  for ($p = 1; $p -le 20; $p++) {
    $json = Api "matches?phase_id=$phase&per_page=100&page=$p"
    if ($json -notmatch '"success":true') { throw 'API-Antwort ungültig' }
    [void]$sb.Append("window.HB_DATA.pages.push($json);`n")
    $spiele += (ConvertFrom-Json $json).data
    if ($json -match "`"last_page`":$p[,}]") { break }
  }
  try { $st = Api "standings?phase_id=$phase"; [void]$sb.Append("window.HB_DATA.standings = $st;`n") } catch {}
  [IO.File]::WriteAllText((Join-Path $daten 'daten.js'), $sb.ToString(), $utf8)
  $ok = $true

  $grenze = (Get-Date).ToUniversalTime().AddDays(-7).ToString('yyyy-MM-dd')
  $neu = 0
  foreach ($m in $spiele) {
    if ($m.status.short_name -ne 'FIN') { continue }
    $lf = Join-Path $cache "$($m.id)_l.json"; $ef = Join-Path $cache "$($m.id)_e.json"
    $tag = ([string]$m.date).Substring(0, 10)
    if ((Test-Path $lf) -and (Test-Path $ef) -and ($tag -le $grenze)) { continue }
    try {
      $l = Api "matches/$($m.id)/lineups"; if ($l -match '"success":true') { [IO.File]::WriteAllText($lf, $l, $utf8) }
      $e = Api "matches/$($m.id)/events"; if ($e -match '"data":\[') { [IO.File]::WriteAllText($ef, $e, $utf8) }
      $neu++; Write-Host -NoNewline '.'
    } catch {}
  }
  if ($neu -gt 0) { Write-Host " $neu Spielberichte geladen." }
} catch {}

# Spielberichte für die App bündeln
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("window.HB_DETAILS = {};`n")
Get-ChildItem $cache -Filter '*_l.json' | ForEach-Object {
  $mid = $_.Name -replace '_l\.json$', ''
  $ef = Join-Path $cache "$($mid)_e.json"
  $e = if (Test-Path $ef) { [IO.File]::ReadAllText($ef) } else { 'null' }
  [void]$sb.Append("window.HB_DETAILS[$mid] = {`"l`": $([IO.File]::ReadAllText($_.FullName)), `"e`": $e};`n")
}
[IO.File]::WriteAllText((Join-Path $daten 'spielberichte.js'), $sb.ToString(), $utf8)

# Torhüterinnen-Erfassungen (daten/torwart/*.json) für die App bündeln
$tw = Join-Path $daten 'torwart'
$teile = @()
if (Test-Path $tw) { Get-ChildItem $tw -Filter 'torwart-*.json' | Sort-Object Name | ForEach-Object { $teile += [IO.File]::ReadAllText($_.FullName) } }
$liste = Join-Path $tw 'goalkeepers.json'
$kader = if (Test-Path $liste) { [IO.File]::ReadAllText($liste) } else { '{}' }
[IO.File]::WriteAllText((Join-Path $daten 'torwart.js'), "window.HB_TORWART = {`"goalkeepers`": $kader, `"records`": [" + ($teile -join ',') + "]};`n", $utf8)

# Browser-Cache umgehen: Datenstand als Versionsmerkmal in die Seite schreiben
$idx = Join-Path $root 'app\index.html'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
[IO.File]::WriteAllText($idx, ([IO.File]::ReadAllText($idx) -replace '\?t=\d+', "?t=$stamp"), $utf8)

if ($ok) { Write-Host 'Daten aktualisiert.' } else { Write-Host 'Kein Abruf möglich, die App zeigt den letzten gespeicherten Stand.' }
Start-Process (Join-Path $root 'app\index.html')
