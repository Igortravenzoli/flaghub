param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prod')]
    [string]$Target,

    [switch]$Link = $true
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$SupabaseDir = Join-Path $Root 'supabase'
$ConfigPath = Join-Path $SupabaseDir 'config.toml'
$SourcePath = Join-Path $SupabaseDir ("config.$Target.toml")

if (!(Test-Path $SourcePath)) {
    throw "Config source not found: $SourcePath"
}

$sourceContent = Get-Content -Path $SourcePath -Raw

$projectIdMatch = [regex]::Match($sourceContent, '(?m)^\s*project_id\s*=\s*"([^"]+)"\s*$')
if (!$projectIdMatch.Success) {
    throw "project_id not found in $SourcePath"
}

$urlMatch = [regex]::Match($sourceContent, '(?m)^\s*supabase_url\s*=\s*"([^"]+)"\s*$')
$anonMatch = [regex]::Match($sourceContent, '(?m)^\s*anon_key\s*=\s*"([^"]+)"\s*$')

$projectRef = $projectIdMatch.Groups[1].Value
$activeConfig = @(
    '# Active Supabase config (managed by supabase/set-active-config.ps1)'
    "project_id = `"$projectRef`""
) -join "`n"

Set-Content -Path $ConfigPath -Value $activeConfig -NoNewline

Write-Host "Active Supabase config set to: $Target" -ForegroundColor Green
Write-Host "Using file: $SourcePath" -ForegroundColor Cyan
if ($urlMatch.Success) {
    Write-Host "URL: $($urlMatch.Groups[1].Value)" -ForegroundColor DarkCyan
}
if ($anonMatch.Success) {
    Write-Host "Anon key: loaded" -ForegroundColor DarkCyan
}

if ($Link) {
    Write-Host "Linking Supabase CLI to project: $projectRef" -ForegroundColor Cyan
    npx supabase link --project-ref $projectRef
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: could not link Supabase CLI to $projectRef (check login/token)." -ForegroundColor Yellow
        Write-Host "Config switch was applied successfully anyway." -ForegroundColor Yellow
    }
}

Write-Host "Done." -ForegroundColor Green
