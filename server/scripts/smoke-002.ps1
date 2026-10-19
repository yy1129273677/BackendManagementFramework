# =============================================================================
# 需求 002 的端到端验证脚本
#
# 验证点：
#   1. 新建表格配置时，按钮权限码默认按 TCID 生成（data:create:<tcid>）
#   2. 路由支持 accessType（公开 / 按角色）和 config（JSON）
#   3. 权限树接口返回「菜单 + 表格按钮」，菜单节点码是 menu:<routeId>
#   4. 按角色控制的菜单：勾了权限的用户能拿到，没勾的拿不到
#   5. 按 TCID 的按钮权限码：勾了才能新增数据，没勾 403
#
# 用法（后端已启动、数据库已迁移）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-002.ps1 `
#     -BaseUrl http://127.0.0.1:3000/api
#
# 脚本自己创建子系统、跑完删掉，不污染演示数据。
# 注意：文件必须存成 UTF-8 with BOM，否则 Windows PowerShell 5.1 会把中文读成乱码导致解析失败。
# =============================================================================
param([string]$BaseUrl = "http://127.0.0.1:3000/api")

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0
$suffix = Get-Date -Format "HHmmss"
$systemCode = "r002$suffix"

function Assert-That {
  param([bool]$Condition, [string]$Message)
  if ($Condition) {
    $script:passed++
    Write-Host "  [PASS] $Message" -ForegroundColor Green
  } else {
    $script:failed++
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
  }
}

# 不抛异常，4xx 也把 JSON 响应体读出来交给脚本判断（PS 5.1 的坑：响应体在 ErrorDetails.Message）
function Invoke-Api {
  param([string]$Method = "GET", [string]$Path, $Body = $null, [hashtable]$Headers = $null)

  $uri = "$BaseUrl$Path"
  try {
    if ($null -ne $Body) {
      $json = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12))
      if ($Headers) {
        $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $Headers -ContentType "application/json; charset=utf-8" -Body $json -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
      } else {
        $response = Invoke-WebRequest -Uri $uri -Method $Method -ContentType "application/json; charset=utf-8" -Body $json -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
      }
    } else {
      if ($Headers) {
        $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $Headers -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
      } else {
        $response = Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
      }
    }
    $text = $response.Content
  } catch {
    $errorBody = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $errorBody = $_.ErrorDetails.Message }
    if ([string]::IsNullOrWhiteSpace($errorBody)) {
      $webResponse = $_.Exception.Response
      if ($null -eq $webResponse) { throw }
      $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
      $errorBody = $reader.ReadToEnd()
      $reader.Close()
    }
    $text = $errorBody
  }

  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return $text | ConvertFrom-Json
}

Write-Host "==== 1. 超管登录 ====" -ForegroundColor Cyan
$login = Invoke-Api -Method Post -Path "/auth/login" -Body @{ username = "yy1"; password = "yy1129273677" }
Assert-That ([bool]$login.data.token) "超管登录成功"
$admin = @{ Authorization = "Bearer $($login.data.token)" }

Write-Host "==== 2. 新建子系统 ====" -ForegroundColor Cyan
$created = Invoke-Api -Method Post -Path "/systems" -Headers $admin -Body @{ code = $systemCode; name = "需求002验证-$suffix" }
Assert-That ($created.code -eq 0) "新建子系统 $systemCode"
$systemId = $created.data.id
$sysH = @{ Authorization = "Bearer $($login.data.token)"; "X-System-Code" = $systemCode }

Write-Host "==== 3. 新建表格配置（不传 operations，验证默认权限码）====" -ForegroundColor Cyan
$cfg = Invoke-Api -Method Post -Path "/table-configs" -Headers $sysH -Body @{
  name = "需求002表"
  fields = @(
    @{ name = "item_name"; label = "名称"; type = "string"; searchable = $true; searchOp = "like"; required = $true },
    @{ name = "qty"; label = "数量"; type = "integer" }
  )
  customActions = @(@{ label = "标记"; value = "mark"; permission = "data:action:custom" })
}
Assert-That ($cfg.code -eq 0) "创建表格配置成功（TCID=$($cfg.data.tcid)）"
$tcid = $cfg.data.tcid
Assert-That ($cfg.data.operations.createPermission -eq "data:create:$tcid") "默认新增权限码按 TCID 生成：$($cfg.data.operations.createPermission)"
Assert-That ($cfg.data.operations.updatePermission -eq "data:update:$tcid") "默认修改权限码按 TCID 生成"

Write-Host "==== 4. 建路由（按角色 + JSON 配置）====" -ForegroundColor Cyan
$route = Invoke-Api -Method Post -Path "/routes" -Headers $sysH -Body @{
  title = "订单中心"
  path = "/order$suffix"
  type = "TABLE"
  tcid = $tcid
  icon = "ShoppingCart"
  accessType = "ROLE"
  config = @{ pageTitle = "订单中心"; defaultPageSize = 30 }
}
Assert-That ($route.code -eq 0) "创建按角色控制的路由"
Assert-That ($route.data.accessType -eq "ROLE") "路由 accessType = ROLE"
Assert-That ($route.data.config.pageTitle -eq "订单中心") "路由 JSON 配置已保存"
$routeId = $route.data.id

# 公开路由（对照组）
$publicRoute = Invoke-Api -Method Post -Path "/routes" -Headers $sysH -Body @{
  title = "公开页面"; path = "/public$suffix"; type = "TABLE"; tcid = $tcid; accessType = "PUBLIC"
}
Assert-That ($publicRoute.code -eq 0) "创建公开路由"

Write-Host "==== 5. 权限树 ====" -ForegroundColor Cyan
$tree = Invoke-Api -Path "/roles/permission-tree" -Headers $sysH
Assert-That ($tree.code -eq 0) "权限树接口可用"
$groupTitles = @($tree.data.tree | ForEach-Object { $_.title })
Assert-That ($groupTitles -contains "系统功能") "树里有「系统功能」分组"
Assert-That ($groupTitles -contains "菜单与按钮") "树里有「菜单与按钮」分组"

$menuGroup = $tree.data.tree | Where-Object { $_.title -eq "菜单与按钮" } | Select-Object -First 1
$roleNode = $menuGroup.children | Where-Object { $_.code -eq "menu:$routeId" } | Select-Object -First 1
Assert-That ($null -ne $roleNode) "按角色菜单出现在树里（menu:<routeId>）"
Assert-That ($roleNode.disabled -eq $false) "按角色菜单可勾选"

$publicNode = $menuGroup.children | Where-Object { $_.title -eq "公开页面" } | Select-Object -First 1
Assert-That ($publicNode.disabled -eq $true) "公开菜单不可勾选"

$buttonCodes = @($roleNode.children | ForEach-Object { $_.code })
$buttonTitles = @($roleNode.children | ForEach-Object { $_.title })
Assert-That ($buttonCodes -contains "data:create:$tcid") "菜单下列表按钮权限含 data:create:<tcid>"
Assert-That ($buttonTitles -contains "新增（$($cfg.data.name)）") "按钮节点标题带表格名"
Assert-That ($buttonCodes.Count -ge 3) "按钮节点包含新增/修改/删除（实际 $($buttonCodes.Count) 个）"

Write-Host "==== 6. 有权限的角色能看到菜单、能操作数据 ====" -ForegroundColor Cyan
$role = Invoke-Api -Method Post -Path "/roles" -Headers $sysH -Body @{
  code = "VIEWER"
  name = "只读角色"
  permissions = @("menu:$routeId", "data:read", "data:create:$tcid")
}
Assert-That ($role.code -eq 0) "创建带菜单+按钮权限的角色"

$user = Invoke-Api -Method Post -Path "/users" -Headers $sysH -Body @{
  username = "viewer"; password = "viewer123"; roleId = $role.data.id
}
Assert-That ($user.code -eq 0) "在该子系统建用户并绑定角色"

$demoLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  username = "viewer"; password = "viewer123"; systemCode = $systemCode
}
Assert-That ([bool]$demoLogin.data.token) "普通用户登录成功"
$userH = @{ Authorization = "Bearer $($demoLogin.data.token)" }

$myRoutes = Invoke-Api -Path "/routes/my" -Headers $userH
$myTitles = @($myRoutes.data.list | ForEach-Object { $_.title })
Assert-That ($myTitles -contains "订单中心") "勾了菜单权限：能看到该菜单"
Assert-That ($myTitles -contains "公开页面") "公开菜单：登录即可见"

$insertOk = Invoke-Api -Method Post -Path "/table/$tcid/data" -Headers $userH -Body @{ item_name = "测试行"; qty = 1 }
Assert-That ($insertOk.code -eq 0) "勾了新增按钮权限：可以新增数据"

$updateDenied = Invoke-Api -Method Patch -Path "/table/$tcid/data/$($insertOk.data.id)" -Headers $userH -Body @{ qty = 2 }
Assert-That ($updateDenied.code -eq 403) "没勾修改按钮权限：修改被拒绝（HTTP $($updateDenied.code)）"

Write-Host "==== 7. 没权限的角色看不到菜单 ====" -ForegroundColor Cyan
$role2 = Invoke-Api -Method Post -Path "/roles" -Headers $sysH -Body @{ code = "NONE"; name = "无权限角色"; permissions = @() }
$user2 = Invoke-Api -Method Post -Path "/users" -Headers $sysH -Body @{
  username = "nobody"; password = "nobody123"; roleId = $role2.data.id
}
Assert-That ($user2.code -eq 0) "创建无权限用户"

$xLogin = Invoke-Api -Method Post -Path "/auth/login" -Body @{
  username = "nobody"; password = "nobody123"; systemCode = $systemCode
}
$xH = @{ Authorization = "Bearer $($xLogin.data.token)" }
$xRoutes = Invoke-Api -Path "/routes/my" -Headers $xH
$xTitles = @($xRoutes.data.list | ForEach-Object { $_.title })
Assert-That ($xTitles -notcontains "订单中心") "没勾菜单权限：看不到按角色的菜单"
Assert-That ($xTitles -contains "公开页面") "公开菜单仍然可见"

Write-Host "==== 8. 清理 ====" -ForegroundColor Cyan
$cleanup = Invoke-Api -Method Delete -Path "/systems/$systemId" -Headers $admin
Assert-That ($cleanup.code -eq 0) "删除测试子系统（连带 DROP 物理表）"

Write-Host ""
if ($failed -eq 0) {
  Write-Host "✅ 需求 002 验证全部通过：$passed 项" -ForegroundColor Green
  exit 0
} else {
  Write-Host "❌ 需求 002 验证失败：$failed 项 / $passed 项通过" -ForegroundColor Red
  exit 1
}
