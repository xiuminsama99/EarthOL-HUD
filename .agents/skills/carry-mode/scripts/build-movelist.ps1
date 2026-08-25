# build-movelist.ps1
# 扫描所有已安装技能，更新出招表标记段（只写 AGENTS-RULES.md，单一真相源）
# 出招表三列：技能名 | 一句话功能 | 效果（description）。"一句话功能"读 oneliners.txt 侧车填充，缺失则留空。
# 构建元数据（时间戳/技能快照）写入 state.txt 侧车文件，不进注入正文，避免污染上下文缓存。
# 用法: powershell -ExecutionPolicy Bypass -File scripts/build-movelist.ps1

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$scriptsDir = $PSScriptRoot
$carryDir = Split-Path -Parent $scriptsDir
$skillsDir = Split-Path -Parent $carryDir
$stateFile = Join-Path $carryDir "state.txt"
$onelinersFile = Join-Path $carryDir "oneliners.txt"
$stateKeys = @('lastBuildAt','skillCount','skillList','skillListChanged','lastInjectedAt')

# --- 读取旧状态（key=value 行，缺失字段返回空）---
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

$state = Read-State -Path $stateFile

# --- 读取一句话功能（oneliners.txt，技能名=一句话）---
$oneliners = @{}
if (Test-Path $onelinersFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($onelinersFile, $utf8NoBom)) {
        if ($line -match '^([^=]+)=(.*)$') { $oneliners[$matches[1]] = $matches[2] }
    }
}

# --- 扫描技能 ---
$skillDirs = Get-ChildItem -Path $skillsDir -Directory | Sort-Object Name
$moveRows = @()
$skillNames = @()

foreach ($dir in $skillDirs) {
    $skillFile = Join-Path $dir.FullName "SKILL.md"
    if (-not (Test-Path $skillFile)) { continue }

    $content = [System.IO.File]::ReadAllText($skillFile, $utf8NoBom)
    if ($content -notmatch '(?s)^---\r?\n(.*?)\r?\n---') { continue }

    $frontmatter = $matches[1]
    $name = ""
    $description = ""

    if ($frontmatter -match '(?m)^name:\s*(.+?)(\r?\n|$)') {
        $name = $matches[1].Trim().Trim('"').Trim("'")
    }
    if ($frontmatter -match '(?m)^description:\s*(.+?)(\r?\n|$)') {
        $description = $matches[1].Trim().Trim('"').Trim("'")
    }

    if ($name) {
        $oneliner = ""
        if ($oneliners.ContainsKey($name)) { $oneliner = $oneliners[$name] }
        $oneliner = $oneliner -replace '\|', '\|'
        $description = $description -replace '\|', '\|'
        $moveRows += "| $name | $oneliner | $description |"
        $skillNames += $dir.Name
    }
}

if ($moveRows.Count -eq 0) {
    Write-Warning "未找到任何技能"
    exit 1
}

# --- 构建出招表块（纯表格，无元数据）---
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$skillList = ($skillNames | Sort-Object) -join ","
$moveBlock = @"
<!-- MOVELIST START -->
| 技能名 (name) | 一句话功能 | 效果 (description) |
|---|---|---|
$($moveRows -join "`n")
<!-- MOVELIST END -->
"@

# --- 更新状态侧车（元数据移到这里，不进上下文）---
$prevSkillList = ""
if ($state.ContainsKey("skillList")) { $prevSkillList = $state["skillList"] }
$state["lastBuildAt"] = $timestamp
$state["skillCount"] = $moveRows.Count
$state["skillList"] = $skillList
$state["skillListChanged"] = if ($prevSkillList -ne $skillList) { "True" } else { "False" }
Write-State -Path $stateFile -Hash $state

# --- 更新目标文件 ---
function Update-MovelistSection {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        Write-Warning "文件不存在: $FilePath"
        return
    }

    $content = [System.IO.File]::ReadAllText($FilePath, $utf8NoBom)
    $startMarker = "<!-- MOVELIST START -->"
    $endMarker = "<!-- MOVELIST END -->"
    $startIdx = $content.IndexOf($startMarker)
    $endIdx = $content.IndexOf($endMarker)

    if ($startIdx -ge 0 -and $endIdx -gt $startIdx) {
        $before = $content.Substring(0, $startIdx)
        $after = $content.Substring($endIdx + $endMarker.Length)
        $newContent = $before + $moveBlock.Trim() + $after
        [System.IO.File]::WriteAllText($FilePath, $newContent, $utf8NoBom)
        Write-Host "已更新: $FilePath ($($moveRows.Count) 个技能)"
    }
    else {
        Write-Warning "未找到标记段: $FilePath"
    }
}

Update-MovelistSection -FilePath (Join-Path $carryDir "AGENTS-RULES.md")
