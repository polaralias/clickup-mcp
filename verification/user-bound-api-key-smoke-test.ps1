$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3011"

Write-Host "--- User-Bound API Key Smoke Test ---"

# 1. Verify 401 without key
Write-Host "1. Testing access without key..."
try {
    Invoke-RestMethod -Uri "$baseUrl/mcp?test=1" -Method Post -Body @{} -Headers @{ "Accept" = "application/json, text/event-stream" }
    Write-Error "Expected 401, got success"
}
catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "Success: Got 401 as expected" -ForegroundColor Green
    }
    else {
        Write-Error "Expected 401, got $($_.Exception.Response.StatusCode)"
    }
}

# 2. Provision Key
Write-Host "2. Provisioning new key..."
$configPayload = @{
    apiKey = "pk_test_12345"
    teamId = "12345"
}
try {
    $res = Invoke-RestMethod -Uri "$baseUrl/api/api-keys" -Method Post -Body ($configPayload | ConvertTo-Json) -Headers @{ "Content-Type" = "application/json" }
    $apiKey = $res.apiKey
    if ($apiKey -match "^mcp_sk_") {
        Write-Host "Success: Got API Key: $apiKey" -ForegroundColor Green
    }
    else {
        Write-Error "Invalid API Key format: $apiKey"
    }
}
catch {
    Write-Error "Failed to provision key: $_"
}

# 3. Verify Access with Bearer
Write-Host "3. Testing access with Bearer token..."
try {
    # We expect 200 or 500 (if config is invalid for real connection), but NOT 401
    # Since we used a fake pk_, it might fail downstream in ClickUp connection, but that means Auth passed.
    # The server might return 400/500 if teamId resolution fails.
    # We want to check status code is NOT 401.
    Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body @{} -Headers @{ 
        "Authorization" = "Bearer $apiKey"
        "Accept"        = "application/json, text/event-stream"
    }
    Write-Host "Success: Auth passed (200 OK)" -ForegroundColor Green
}
catch {
    $code = $_.Exception.Response.StatusCode
    if ($code -eq 401) {
        Write-Error "Failed: Got 401 Unauthorized"
    }
    else {
        Write-Host "Success: Auth passed (Got $code, which means middleware accepted key)" -ForegroundColor Green
    }
}

# 4. Verify Access with X-API-Key
Write-Host "4. Testing access with X-API-Key..."
try {
    Invoke-RestMethod -Uri "$baseUrl/mcp" -Method Post -Body @{} -Headers @{ 
        "X-API-Key" = $apiKey
        "Accept"    = "application/json, text/event-stream"
    }
    Write-Host "Success: Auth passed (200 OK)" -ForegroundColor Green
}
catch {
    $code = $_.Exception.Response.StatusCode
    if ($code -eq 401) {
        Write-Error "Failed: Got 401 Unauthorized"
    }
    else {
        Write-Host "Success: Auth passed (Got $code)" -ForegroundColor Green
    }
}

Write-Host "--- Test Complete ---"
