# inject-rules.ps1
# 把 AGENTS-RULES.md 模板正文注入项目 AGENTS.md 的标记段（幂等）
# 注入块不含时间戳；注入时间写入 state.txt 侧车文件的 lastInjectedAt，不进注入正文。
# 用法: powershell -ExecutionPolicy Bypass -File scripts/inject-rules.ps1 [-Template <path>] [-Target <path>]

param(
    [string]$Template,
    [string]$Target
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$scriptsDir  = $PSScriptRoot
$carryDir    = Split-Path -Parent $scriptsDir
$skillsDir   = Split-Path -Parent $carryDir
$agentsDir   = Split-Path -Parent $skillsDir
$projectRoot = Split-Path -Parent $agentsDir
$stateFile   = Join-Path $carryDir "state.txt"
$stateKeys   = @('lastBuildAt','skillCount','skillList','skillListChanged','lastInjectedAt')

if (-not $Template) { $Template = Join-Path $carryDir "AGENTS-RULES.md" }
if (-not $Target)   { $Target   = Join-Path $projectRoot "AGENTS.md" }

if (-not (Test-Path $Template)) {
    Write-Warning "模板不存在: $Template"
    exit 1
}

# --- 读取/写回状态侧车 ---
function Read-State {
    param([string]$Path)
    $h = @{}
    if (Test-Path $Path) {
        foreach ($line in [System.IO.File]::ReadAllLines($Path, $utf8NoBom)) {
            if ($line -match '^([^=]+)=(.*)$') { $h[$matches[1]] = $matches[2] }
        }
    }
    return $h
}
function Write-State {
    param([string]$Path, $Hash)
    $lines = @()
    foreach ($k in $stateKeys) {
        $v = ""
        if ($Hash.ContainsKey($k)) { $v = $Hash[$k] }
        $lines += "$k=$v"
    }
    [System.IO.File]::WriteAllLines($Path, $lines, $utf8NoBom)
}

# --- 提取模板正文（第一个独占一行的 --- 之后的内容）---
$templateContent = [System.IO.File]::ReadAllText($Template, $utf8NoBom)
if ($templateContent -notmatch '(?m)^---\s*$') {
    Write-Warning "模板未找到 --- 分隔线，无法定位正文起点"
    exit 1
}
$body = $templateContent -replace '(?s)^.*?\r?\n---\r?\n', ''
$body = $body.Trim()
if ([string]::IsNullOrWhiteSpace($body)) {
    Write-Warning "模板正文为空"
    exit 1
}

# --- 构建注入块（不含时间戳）---
$injectBlock = @"
<!-- CARRY-MODE START -->
$body
<!-- CARRY-MODE END -->
"@

# --- 写入目标 AGENTS.md ---
$startMarker = "<!-- CARRY-MODE START -->"
$endMarker   = "<!-- CARRY-MODE END -->"

if (-not (Test-Path $Target)) {
    # 目标不存在：创建并写入标记段
    $newContent = "# AGENTS`r`n`r`n$injectBlock`r`n"
    [System.IO.File]::WriteAllText($Target, $newContent, $utf8NoBom)
    Write-Host "已创建: $Target"
    Write-Host "已注入 Carry Mode 规则段"
}
else {
    $targetContent = [System.IO.File]::ReadAllText($Target, $utf8NoBom)
    $startIdx = $targetContent.IndexOf($startMarker)
    $endIdx   = $targetContent.IndexOf($endMarker)

    if ($startIdx -ge 0 -and $endIdx -gt $startIdx) {
        # 已有标记段：替换
        $before = $targetContent.Substring(0, $startIdx)
        $after  = $targetContent.Substring($endIdx + $endMarker.Length)
        $newContent = $before + $injectBlock + $after
        [System.IO.File]::WriteAllText($Target, $newContent, $utf8NoBom)
        Write-Host "已更新标记段: $Target"
    }
    else {
        # 无标记段：追加到末尾
        $sep = "`r`n`r`n"
        if ($targetContent.EndsWith("`r`n"))    { $sep = "`r`n" }
        if ($targetContent.EndsWith("`r`n`r`n")) { $sep = "" }
        $newContent = $targetContent + $sep + $injectBlock + "`r`n"
        [System.IO.File]::WriteAllText($Target, $newContent, $utf8NoBom)
        Write-Host "已追加标记段: $Target"
    }
}

# --- 注入时间写入状态侧车 ---
$state = Read-State -Path $stateFile
$state["lastInjectedAt"] = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-State -Path $stateFile -Hash $state
