# ClubFlow — libère les ports dev habituels (API, Vite, Metro Expo) et remonte docker compose.
# Usage (depuis la racine du dépôt ClubFlow) :
#   .\.cursor\skills\restart-clubflow\scripts\restart-clubflow.ps1
#   .\.cursor\skills\restart-clubflow\scripts\restart-clubflow.ps1 -NoRelay

param(
    [switch] $NoRelay
)

$ErrorActionPreference = 'Continue'
# scripts → restart-clubflow → skills → .cursor → racine ClubFlow (4 niveaux)
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..\')

function Stop-ListenerPid {
    param([int] $Port)
    $done = @{}
    $out = netstat -ano 2>$null | Select-String ":$Port\s.*LISTENING"
    foreach ($line in $out) {
        $parts = ($line.ToString() -split '\s+') | Where-Object { $_ -ne '' }
        $procId = [int]$parts[-1]
        if ($procId -gt 0 -and -not $done[$procId]) {
            $done[$procId] = $true
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "Port $Port : PID $procId arrêté."
        }
    }
}

Write-Host "Arrêt des écouteurs dev (3000, 5173-5180, 8081-8088 Metro/Expo)…"
foreach ($p in @(3000) + (5173..5180) + (8081..8088)) {
    Stop-ListenerPid -Port $p
}

Set-Location $repoRoot.Path
if ($NoRelay) {
    Write-Host "Docker : db seule…"
    docker compose up -d db
    docker compose ps
} else {
    Write-Host "Docker : db + postfix (profil relay)…"
    docker compose --profile relay up -d db postfix
    docker compose --profile relay ps
}

Write-Host ""
Write-Host "Ensuite, dans des terminaux dédiés :"
Write-Host "  cd apps\api             ; npm run start:dev"
Write-Host "  cd apps\admin           ; npm run dev"
Write-Host "  cd apps\member-portal   ; npm install   # si besoin"
Write-Host "  cd apps\member-portal   ; npm run dev   # http://localhost:5174/"
Write-Host '  # Optionnel : app mobile Expo (bundler Metro, port 8081 par defaut) :'
Write-Host "  cd apps\mobile          ; npm install   # si besoin"
Write-Host "  cd apps\mobile          ; npx expo start"
Write-Host '  # Emulateur Android : Device Manager ; dans Expo : touche a'
Write-Host '  # .env mobile : EXPO_PUBLIC_GRAPHQL_HTTP=http://10.0.2.2:3000/graphql'
