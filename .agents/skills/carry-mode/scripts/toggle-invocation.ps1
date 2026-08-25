# toggle-invocation.ps1
# 一键开关技能的 AI 自动调用权限（除 carry-mode 与 ceo-dispatch 外）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/toggle-invocation.ps1 -Action enable|disable
#   enable  : 开放 AI 自动调用（disable-model-invocation: true→false, allow_implicit_invocation: false→true）
#   disable : 关闭 AI 自动调用（反向回退）

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("enable", "disable")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$scriptsDir  = $PSScriptRoot
$carryDir    = Split-Path -Parent $scriptsDir
$skillsDir   = Split-Path -Parent $carryDir
$excludeSkills = @("ceo-dispatch", "carry-mode")

# enable: 禁止值→允许值；disable: 允许值→禁止值
if ($Action -eq "enable") {
    $skillMdFrom = "true";  $skillMdTo = "false"
    $yamlFrom    = "false"; $yamlTo    = "true"
    $label = "开放 AI 自动调用"
} else {
    $skillMdFrom = "false"; $skillMdTo = "true"
    $yamlFrom    = "true";  $yamlTo    = "false"
    $label = "关闭 AI 自动调用"
}

# 正则：捕获字段名前缀（含缩进和冒号空格），替换值
$skillPattern = "(?m)^(disable-model-invocation:\s*)" + $skillMdFrom + "\s*$"
$skillReplacement = '${1}' + $skillMdTo
$yamlPattern  = "(?m)^(  allow_implicit_invocation:\s*)" + $yamlFrom + "\s*$"
$yamlReplacement  = '${1}' + $yamlTo

$skillDirs = Get-ChildItem -Path $skillsDir -Directory | Sort-Object Name
$changed = 0
$skipped = 0

foreach ($dir in $skillDirs) {
    if ($excludeSkills -contains $dir.Name) {
        Write-Host "跳过(排除): $($dir.Name)"
        continue
    }

    $skillFile = Join-Path $dir.FullName "SKILL.md"
    $yamlFile  = Join-Path $dir.FullName "agents\openai.yaml"
    $skillChanged = $false
    $yamlChanged  = $false

    # SKILL.md: disable-model-invocation
    if (Test-Path $skillFile) {
        $content = [System.IO.File]::ReadAllText($skillFile, $utf8NoBom)
        if ($content -match $skillPattern) {
            $newContent = [regex]::Replace($content, $skillPattern, $skillReplacement)
            [System.IO.File]::WriteAllText($skillFile, $newContent, $utf8NoBom)
            $skillChanged = $true
        }
    }

    # openai.yaml: allow_implicit_invocation
    if (Test-Path $yamlFile) {
        $content = [System.IO.File]::ReadAllText($yamlFile, $utf8NoBom)
        if ($content -match $yamlPattern) {
            $newContent = [regex]::Replace($content, $yamlPattern, $yamlReplacement)
            [System.IO.File]::WriteAllText($yamlFile, $newContent, $utf8NoBom)
            $yamlChanged = $true
        }
    }

    if ($skillChanged -or $yamlChanged) {
        $parts = @()
        if ($skillChanged) { $parts += "SKILL.md" }
        if ($yamlChanged)  { $parts += "openai.yaml" }
        Write-Host "已$label : $($dir.Name) ($($parts -join ', '))"
        $changed++
    } else {
        $skipped++
    }
}

Write-Host ""
Write-Host "完成: $changed 个技能已$label, $skipped 个无需变更(已为目标状态或无字段)"
Write-Host "排除: $($excludeSkills -join ', ') (永远保持禁止 AI 调用)"
