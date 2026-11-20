param(
    [Parameter(Mandatory = $true)][string]$KeycloakHome,
    [Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$Port
)
$ErrorActionPreference = 'Stop'
& (Join-Path $KeycloakHome 'bin/kc.bat') start-dev --http-host=127.0.0.1 --http-port=$Port --import-realm
exit $LASTEXITCODE
