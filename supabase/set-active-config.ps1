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

Copy-Item -Path $SourcePath -Destination $ConfigPath -Force
Write-Host "Active Supabase config set to: $Target" -ForegroundColor Green
Write-Host "Using file: $SourcePath" -ForegroundColor Cyan

if ($Link) {
    $projectRef = if ($Target -eq 'dev') { 'onpdhywrzjtwxaxuvijw' } else { 'nxmgppfyltwsqryfxkbm' }
    Write-Host "Linking Supabase CLI to project: $projectRef" -ForegroundColor Cyan
    npx supabase link --project-ref $projectRef
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: could not link Supabase CLI to $projectRef (check login/token)." -ForegroundColor Yellow
        Write-Host "Config switch was applied successfully anyway." -ForegroundColor Yellow
    }
}

Write-Host "Done." -ForegroundColor Green
