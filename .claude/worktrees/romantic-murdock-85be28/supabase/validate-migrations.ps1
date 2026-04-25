# =====================================================
# Script para validar ordem e integridade das migrations
# =====================================================

$ColorSuccess = "Green"
$ColorError = "Red"
$ColorInfo = "Cyan"
$ColorWarning = "Yellow"

Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $ColorInfo
Write-Host "║            🔍 Validação de Migrations                         ║" -ForegroundColor $ColorInfo
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $ColorInfo
Write-Host ""

# Verificar se está no diretório correto
if (!(Test-Path ".\supabase\migrations")) {
    Write-Host "❌ ERRO: Diretório supabase/migrations não encontrado!" -ForegroundColor $ColorError
    exit 1
}

# Listar todas as migrations
$migrations = Get-ChildItem ".\supabase\migrations\*.sql" | Sort-Object Name

Write-Host "📋 Total de migrations encontradas: $($migrations.Count)" -ForegroundColor $ColorInfo
Write-Host ""

# Validar timestamp e ordem
Write-Host "🔍 Validando ordem cronológica..." -ForegroundColor $ColorInfo
$lastTimestamp = ""
$errors = 0

foreach ($migration in $migrations) {
    $filename = $migration.Name
    
    # Extrair timestamp se seguir o padrão YYYYMMDDHHMMSS
    if ($filename -match '^(\d{14})_') {
        $timestamp = $matches[1]
        
        # Verificar ordem
        if ($lastTimestamp -gt $timestamp) {
            Write-Host "❌ ERRO: Migration fora de ordem: $filename" -ForegroundColor $ColorError
            $errors++
        } else {
            Write-Host "✅ $filename" -ForegroundColor $ColorSuccess
        }
        
        $lastTimestamp = $timestamp
    } else {
        Write-Host "⚠️  AVISO: Arquivo sem timestamp padrão: $filename" -ForegroundColor $ColorWarning
    }
}

Write-Host ""

# Verificar arquivos SQL
Write-Host "🔍 Validando sintaxe SQL básica..." -ForegroundColor $ColorInfo
foreach ($migration in $migrations) {
    $content = Get-Content $migration.FullName -Raw
    
    # Verificar se o arquivo não está vazio
    if ([string]::IsNullOrWhiteSpace($content)) {
        Write-Host "❌ ERRO: Arquivo vazio: $($migration.Name)" -ForegroundColor $ColorError
        $errors++
        continue
    }
    
    # Verificar comandos SQL básicos
    $hasSQL = $content -match '(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\s'
    
    if ($hasSQL) {
        Write-Host "✅ $($migration.Name) - SQL válido" -ForegroundColor $ColorSuccess
    } else {
        Write-Host "⚠️  $($migration.Name) - Nenhum comando SQL encontrado" -ForegroundColor $ColorWarning
    }
}

Write-Host ""

# Verificar duplicatas
Write-Host "🔍 Verificando duplicatas..." -ForegroundColor $ColorInfo
$names = @{}
foreach ($migration in $migrations) {
    if ($names.ContainsKey($migration.Name)) {
        Write-Host "❌ ERRO: Migration duplicada: $($migration.Name)" -ForegroundColor $ColorError
        $errors++
    } else {
        $names[$migration.Name] = $true
    }
}

if ($names.Count -eq $migrations.Count) {
    Write-Host "✅ Nenhuma duplicata encontrada" -ForegroundColor $ColorSuccess
}

Write-Host ""

# Listar arquivos especiais
Write-Host "📝 Arquivos especiais identificados:" -ForegroundColor $ColorInfo
$specialFiles = $migrations | Where-Object { $_.Name -notmatch '^\d{14}_' }
if ($specialFiles.Count -gt 0) {
    foreach ($file in $specialFiles) {
        Write-Host "   📄 $($file.Name)" -ForegroundColor $ColorWarning
        Write-Host "      ⚠️  Este arquivo pode precisar ser aplicado manualmente" -ForegroundColor $ColorWarning
    }
} else {
    Write-Host "   ✅ Nenhum arquivo especial encontrado" -ForegroundColor $ColorSuccess
}

Write-Host ""

# Resumo
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $ColorInfo
Write-Host "║                         RESUMO                                ║" -ForegroundColor $ColorInfo
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $ColorInfo
Write-Host ""
Write-Host "Total de migrations: $($migrations.Count)" -ForegroundColor $ColorInfo
Write-Host "Erros encontrados: $errors" -ForegroundColor $(if ($errors -eq 0) { $ColorSuccess } else { $ColorError })
Write-Host "Arquivos especiais: $($specialFiles.Count)" -ForegroundColor $ColorWarning
Write-Host ""

if ($errors -eq 0) {
    Write-Host "✅ VALIDAÇÃO CONCLUÍDA: Tudo OK!" -ForegroundColor $ColorSuccess
    Write-Host ""
    Write-Host "📝 Próximo passo: Execute apply-all-migrations.ps1" -ForegroundColor $ColorInfo
    exit 0
} else {
    Write-Host "❌ VALIDAÇÃO FALHOU: Corrija os erros antes de continuar" -ForegroundColor $ColorError
    exit 1
}
