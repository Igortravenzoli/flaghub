# =====================================================
# Script para aplicar todas as migrations no FlagHubDB-Dev
# =====================================================

param(
    [string]$ProjectRef = "",
    [switch]$DryRun = $false,
    [switch]$Help = $false
)

# Cores para output
$ColorSuccess = "Green"
$ColorError = "Red"
$ColorInfo = "Cyan"
$ColorWarning = "Yellow"

function Show-Help {
    Write-Host @"
╔═══════════════════════════════════════════════════════════════╗
║         Apply All Migrations - FlagHubDB-Dev                  ║
╚═══════════════════════════════════════════════════════════════╝

USO:
    .\apply-all-migrations.ps1 -ProjectRef <project_ref> [-DryRun]

PARÂMETROS:
    -ProjectRef    ID do projeto Supabase (ex: abc123xyz)
    -DryRun        Apenas valida sem aplicar as migrations
    -Help          Mostra esta mensagem

EXEMPLOS:
    # Aplicar migrations no projeto dev
    .\apply-all-migrations.ps1 -ProjectRef abc123xyz

    # Validar migrations sem aplicar
    .\apply-all-migrations.ps1 -ProjectRef abc123xyz -DryRun

"@ -ForegroundColor $ColorInfo
}

if ($Help) {
    Show-Help
    exit 0
}

# Validar parâmetros
if ([string]::IsNullOrEmpty($ProjectRef)) {
    Write-Host "❌ ERRO: ProjectRef é obrigatório!" -ForegroundColor $ColorError
    Write-Host ""
    Show-Help
    exit 1
}

Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $ColorInfo
Write-Host "║         🚀 Aplicando Migrations - FlagHubDB-Dev              ║" -ForegroundColor $ColorInfo
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $ColorInfo
Write-Host ""

# Verificar se está no diretório correto
$currentPath = Get-Location
if (!(Test-Path ".\supabase\migrations")) {
    Write-Host "❌ ERRO: Diretório supabase/migrations não encontrado!" -ForegroundColor $ColorError
    Write-Host "   Execute este script da raiz do projeto." -ForegroundColor $ColorError
    exit 1
}

# Verificar se Supabase CLI está instalado
Write-Host "🔍 Verificando Supabase CLI..." -ForegroundColor $ColorInfo
try {
    $supabaseVersion = supabase --version 2>&1
    Write-Host "✅ Supabase CLI encontrado: $supabaseVersion" -ForegroundColor $ColorSuccess
} catch {
    Write-Host "❌ ERRO: Supabase CLI não encontrado!" -ForegroundColor $ColorError
    Write-Host "   Instale com: npm install -g supabase" -ForegroundColor $ColorWarning
    exit 1
}

Write-Host ""

# Listar migrations
Write-Host "📋 Migrations encontradas:" -ForegroundColor $ColorInfo
$migrations = Get-ChildItem ".\supabase\migrations\*.sql" | Sort-Object Name
Write-Host "   Total: $($migrations.Count) arquivos" -ForegroundColor $ColorInfo
Write-Host ""

foreach ($migration in $migrations) {
    Write-Host "   📄 $($migration.Name)" -ForegroundColor Gray
}

Write-Host ""

if ($DryRun) {
    Write-Host "ℹ️  MODO DRY-RUN: Nenhuma alteração será aplicada" -ForegroundColor $ColorWarning
    Write-Host ""
    exit 0
}

# Confirmar ação
Write-Host "⚠️  ATENÇÃO: Isso irá aplicar todas as migrations no projeto:" -ForegroundColor $ColorWarning
Write-Host "   Project Ref: $ProjectRef" -ForegroundColor $ColorWarning
Write-Host ""
$confirmation = Read-Host "Deseja continuar? (digite 'SIM' para confirmar)"

if ($confirmation -ne "SIM") {
    Write-Host "❌ Operação cancelada pelo usuário." -ForegroundColor $ColorWarning
    exit 0
}

Write-Host ""

# Fazer link com o projeto
Write-Host "🔗 Linkando com o projeto Supabase..." -ForegroundColor $ColorInfo
try {
    $linkOutput = supabase link --project-ref $ProjectRef 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ERRO ao linkar projeto:" -ForegroundColor $ColorError
        Write-Host $linkOutput
        exit 1
    }
    Write-Host "✅ Projeto linkado com sucesso!" -ForegroundColor $ColorSuccess
} catch {
    Write-Host "❌ ERRO ao linkar projeto: $_" -ForegroundColor $ColorError
    exit 1
}

Write-Host ""

# Aplicar migrations
Write-Host "🚀 Aplicando migrations..." -ForegroundColor $ColorInfo
Write-Host ""

try {
    $pushOutput = supabase db push 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ERRO ao aplicar migrations:" -ForegroundColor $ColorError
        Write-Host $pushOutput
        exit 1
    }
    
    Write-Host $pushOutput
    Write-Host ""
    Write-Host "✅ Todas as migrations foram aplicadas com sucesso!" -ForegroundColor $ColorSuccess
} catch {
    Write-Host "❌ ERRO ao aplicar migrations: $_" -ForegroundColor $ColorError
    exit 1
}

Write-Host ""

# Verificar migrations aplicadas
Write-Host "🔍 Verificando migrations aplicadas..." -ForegroundColor $ColorInfo
try {
    $listOutput = supabase migration list 2>&1
    Write-Host $listOutput
} catch {
    Write-Host "⚠️  Aviso: Não foi possível listar migrations" -ForegroundColor $ColorWarning
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $ColorSuccess
Write-Host "║                    ✅ CONCLUÍDO COM SUCESSO                   ║" -ForegroundColor $ColorSuccess
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $ColorSuccess
Write-Host ""
Write-Host "📝 Próximos passos:" -ForegroundColor $ColorInfo
Write-Host "   1. Verificar no Supabase Studio: Database → Migrations" -ForegroundColor Gray
Write-Host "   2. Deploy das Edge Functions: supabase functions deploy" -ForegroundColor Gray
Write-Host "   3. Configurar variáveis de ambiente" -ForegroundColor Gray
Write-Host "   4. Testar a aplicação com .env.local" -ForegroundColor Gray
Write-Host ""
