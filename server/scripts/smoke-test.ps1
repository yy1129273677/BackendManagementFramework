# =============================================================================
# 冒烟测试脚本（真实调用后端接口，需要一个已经跑过 migrate + seed 的数据库）
#
# 用法（在 server 目录，先 npm run start:dev 或 node dist/main.js）：
#   powershell -NoProfile -File scripts/smoke-test.ps1                 # 默认 http://127.0.0.1:3000/api
#   powershell -NoProfile -File scripts/smoke-test.ps1 -BaseUrl http://127.0.0.1:3100/api
#
# 它按业务顺序走一遍「配置驱动」的完整链路：
#   登录超管 → 新建子系统 → 切过去 → 建用户 → 配表格（生成 TCID + 真建表）
#   → 增删改查数据（含搜索） → 建路由 → 取菜单
# 并验证 4 个安全/健壮性点：字段名注入、跨租户读、非超管切系统、坏 TCID。
#
# 兼容 Windows PowerShell 5.1 和 PowerShell 7+（没有用 PS7 独有的参数）。
# 脚本结束会自动清理它创建的数据（删子系统会连带删表和配置），不污染演示数据。
# =============================================================================
param(
    [string]$BaseUrl = 'http://127.0.0.1:3000/api',
    [string]$AdminUser = 'yy1',
    [string]$AdminPassword = 'yy1129273677'
)

$ErrorActionPreference = 'Stop'

# 每次跑用不同的系统编码，避免重复执行时撞唯一键
$suffix = Get-Date -Format 'HHmmss'
$systemCode = "smoke$suffix"
$passed = 0
$failed = 0

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

# 统一请求封装。
# 后端出错时返回的也是 JSON（{code, message}），所以 4xx/5xx 不当异常抛，
# 而是把响应体解析出来交给脚本自己判断——这样"预期失败"的用例才好写。
# 不用 -SkipHttpErrorCheck 是为了兼容 Windows PowerShell 5.1。
function Invoke-Api {
    param(
        [string]$Method = 'GET',
        [string]$Path,
        $Body = $null,
        [hashtable]$Headers = $null
    )

    $uri = "$BaseUrl$Path"

    # 注意：这里故意把参数一个个写出来，不用 splatting（@params）。
    # 踩过的坑：在某些非交互式宿主机上，splat 到 Invoke-WebRequest 会让进程静默退出，
    # 连错误都不打，排查成本很高。显式写参数就稳。
    try {
        if ($null -ne $Body) {
            $json = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12))
            if ($Headers) {
                $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $Headers `
                    -ContentType 'application/json; charset=utf-8' -Body $json `
                    -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            } else {
                $response = Invoke-WebRequest -Uri $uri -Method $Method `
                    -ContentType 'application/json; charset=utf-8' -Body $json `
                    -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            }
        } else {
            if ($Headers) {
                $response = Invoke-WebRequest -Uri $uri -Method $Method -Headers $Headers `
                    -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            } else {
                $response = Invoke-WebRequest -Uri $uri -Method $Method `
                    -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            }
        }
        $text = $response.Content
    } catch {
        # 4xx/5xx 也当正常响应处理：把 JSON 响应体读出来交给脚本判断。
        # 注意 PowerShell 5.1 的坑：报错时响应体在 $_.ErrorDetails.Message 里，
        # 直接读 Response 流可能拿到空字符串，所以两条路都试。
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

Write-Host "==== 1. 健康检查 ====" -ForegroundColor Cyan
$health = Invoke-Api -Path '/health'
Assert-That ($health.data.status -eq 'ok') "健康检查返回 ok（db=$($health.data.db), pgvector=$($health.data.pgvector)）"

Write-Host "==== 2. 超管登录 ====" -ForegroundColor Cyan
$login = Invoke-Api -Method Post -Path '/auth/login' -Body @{username = $AdminUser; password = $AdminPassword}
Assert-That ([bool]$login.data.token) '登录成功并拿到 token'
$token = $login.data.token
$adminHeaders = @{Authorization = "Bearer $token"}
Assert-That ($login.data.user.isSuper -eq $true) '超管 isSuper = true'

Write-Host "==== 3. 新建子系统并切换上下文 ====" -ForegroundColor Cyan
$created = Invoke-Api -Method Post -Path '/systems' -Headers $adminHeaders -Body @{code = $systemCode; name = "冒烟测试-$suffix"}
Assert-That ($created.code -eq 0) "新建子系统 $systemCode"
$systemId = $created.data.id

$sysHeaders = @{Authorization = "Bearer $token"; 'X-System-Code' = $systemCode}
$roles = Invoke-Api -Path '/roles' -Headers $sysHeaders
$adminRole = $roles.data.list | Where-Object { $_.code -eq 'ADMIN' } | Select-Object -First 1
Assert-That ($null -ne $adminRole) '新子系统自动带了默认 ADMIN 角色'

Write-Host "==== 4. 在子系统里建用户 ====" -ForegroundColor Cyan
$newUser = Invoke-Api -Method Post -Path '/users' -Headers $sysHeaders -Body @{
    username = 'tester'; password = 'tester123'; nickname = '测试账号'; roleId = $adminRole.id
}
Assert-That ($newUser.code -eq 0) '建用户成功'

Write-Host "==== 5. 配置表格（生成 TCID + 真建物理表）====" -ForegroundColor Cyan
$configBody = @{
    name       = '冒烟测试表'
    remark     = 'smoke-test 创建，脚本结束会删除'
    searchMode = 'AND'
    pageSize   = 10
    fields     = @(
        @{name = 'item_name'; label = '名称'; type = 'string'; visible = $true; searchable = $true; searchOp = 'like'; required = $true; width = 160},
        @{name = 'qty'; label = '数量'; type = 'integer'; visible = $true; searchable = $true; searchOp = 'between'},
        @{name = 'flag'; label = '启用'; type = 'boolean'; visible = $true; searchable = $true; searchOp = 'eq'},
        @{name = 'note'; label = '备注'; type = 'text'; visible = $false; searchable = $false}
    )
    operations = @{create = $true; update = $true; delete = $true; createPermission = 'data:create'; updatePermission = 'data:update'; deletePermission = 'data:delete'}
    customActions = @(@{label = '标记完成'; value = 'done'; type = 'success'})
}
$config = Invoke-Api -Method Post -Path '/table-configs' -Headers $sysHeaders -Body $configBody
Assert-That ($config.code -eq 0 -and $config.data.tcid) "创建成功，TCID = $($config.data.tcid)"
$tcid = $config.data.tcid
Assert-That ($config.data.physicalTable -eq "biz_$($tcid.ToLower())") "物理表名 = $($config.data.physicalTable)"

Write-Host "==== 6. 数据增删改查 + 搜索 ====" -ForegroundColor Cyan
$row1 = Invoke-Api -Method Post -Path "/table/$tcid/data" -Headers $sysHeaders -Body @{item_name = '苹果'; qty = 10; flag = $true; note = '红富士'}
$row2 = Invoke-Api -Method Post -Path "/table/$tcid/data" -Headers $sysHeaders -Body @{item_name = '香蕉'; qty = 100; flag = $false}
$row3 = Invoke-Api -Method Post -Path "/table/$tcid/data" -Headers $sysHeaders -Body @{item_name = '樱桃'; qty = 50; flag = $true}
Assert-That ($row1.code -eq 0 -and $row1.data.id) '新增第 1 行'
Assert-That ($row2.data.qty -eq 100) '数值字段正确写入并返回'
Assert-That ($row3.data.flag -eq $true) '布尔字段正确写入'

$all = Invoke-Api -Path "/table/$tcid/data?page=1&pageSize=10" -Headers $sysHeaders
Assert-That ($all.data.total -eq 3) "不带条件查到 3 条（实际 $($all.data.total)）"

$filters = @{mode = 'AND'; conditions = @(@{field = 'item_name'; op = 'like'; value = '苹'})} | ConvertTo-Json -Depth 8 -Compress
$like = Invoke-Api -Path "/table/$tcid/data?page=1&pageSize=10&filters=$([uri]::EscapeDataString($filters))" -Headers $sysHeaders
Assert-That ($like.data.total -eq 1) "模糊搜索「苹」命中 1 条（实际 $($like.data.total)）"

$filters2 = @{mode = 'AND'; conditions = @(@{field = 'qty'; op = 'between'; value = @(20, 200)})} | ConvertTo-Json -Depth 8 -Compress
$range = Invoke-Api -Path "/table/$tcid/data?page=1&pageSize=10&filters=$([uri]::EscapeDataString($filters2))" -Headers $sysHeaders
Assert-That ($range.data.total -eq 2) "区间搜索 qty 20~200 命中 2 条（实际 $($range.data.total)）"

$updated = Invoke-Api -Method Patch -Path "/table/$tcid/data/$($row1.data.id)" -Headers $sysHeaders -Body @{qty = 11}
Assert-That ($updated.data.qty -eq 11) '修改数据成功'
$deleted = Invoke-Api -Method Delete -Path "/table/$tcid/data/$($row3.data.id)" -Headers $sysHeaders
Assert-That ($deleted.code -eq 0) '删除数据成功'
$after = Invoke-Api -Path "/table/$tcid/data?page=1&pageSize=10" -Headers $sysHeaders
Assert-That ($after.data.total -eq 2) "删除后剩 2 条（实际 $($after.data.total)）"

Write-Host "==== 7. 渲染配置（前端 <Table> 拿的就是这个）====" -ForegroundColor Cyan
$render = Invoke-Api -Path "/table/$tcid/config" -Headers $sysHeaders
Assert-That ($render.data.columns.Count -eq 3) "可见列 3 个（隐藏了 note）"
Assert-That ($render.data.searchFields.Count -eq 3) '搜索项 3 个'
Assert-That ($render.data.operations.create -eq $true) '当前用户有新增权限'
Assert-That ($render.data.customActions[0].value -eq 'done') "自定义按钮 value=done 返回给前端"

Write-Host "==== 8. 建路由 + 取菜单 ====" -ForegroundColor Cyan
$route = Invoke-Api -Method Post -Path '/routes' -Headers $sysHeaders -Body @{
    title = '冒烟测试菜单'; path = "/smoke$suffix"; type = 'TABLE'; tcid = $tcid; icon = 'List'; sort = 1
}
Assert-That ($route.code -eq 0) '创建 TABLE 类型路由'
$mine = Invoke-Api -Path '/routes/my' -Headers $sysHeaders
$myMatched = @($mine.data.list | Where-Object { $_.tcid -eq $tcid })
Assert-That ($myMatched.Count -eq 1) "菜单接口返回该路由（实际匹配 $($myMatched.Count) 条）"

Write-Host "==== 9. 安全与健壮性 ====" -ForegroundColor Cyan
$badField = @{
    name = '注入测试'; fields = @(@{name = 'a"; DROP TABLE x; --'; label = 'x'; type = 'string'})
}
$bad = Invoke-Api -Method Post -Path '/table-configs' -Headers $sysHeaders -Body $badField
Assert-That ($bad.code -eq 400) "非法字段名被拒绝（HTTP $($bad.code)）"

$crossTenant = Invoke-Api -Path "/table/$tcid/config" -Headers $adminHeaders
Assert-That ($crossTenant.code -eq 404) "主系统上下文读不到子系统的 TCID（HTTP $($crossTenant.code)）"

$demoLogin = Invoke-Api -Method Post -Path '/auth/login' -Body @{username = 'demo'; password = 'demo123456'; systemCode = 'demo'}
$demoHeaders = @{Authorization = "Bearer $($demoLogin.data.token)"; 'X-System-Code' = $systemCode}
$forbidden = Invoke-Api -Path '/systems' -Headers $demoHeaders
Assert-That ($forbidden.code -eq 403) "普通用户伪造 X-System-Code 被拒（HTTP $($forbidden.code)）"

$notFound = Invoke-Api -Path "/table/TSMOKEXXXXX/config" -Headers $sysHeaders
Assert-That ($notFound.code -eq 404) "不存在的 TCID 返回 404"

$badLogin = Invoke-Api -Method Post -Path '/auth/login' -Body @{username = $AdminUser; password = 'wrong'}
Assert-That ($badLogin.code -eq 401) '密码错误返回 401'

Write-Host "==== 10. 物理表真的存在吗（走数据库确认）====" -ForegroundColor Cyan
$columns = docker exec bmf-db psql -U bmf -d bmf -t -A -c "select column_name from information_schema.columns where table_name='biz_$($tcid.ToLower())' order by ordinal_position"
$columnList = ($columns -split "`n" | Where-Object { $_ -ne '' }) -join ','
Assert-That ($columnList -match 'id,created_at,updated_at,item_name,qty,flag,note') "物理表列 = $columnList"

Write-Host "==== 11. 清理测试数据 ====" -ForegroundColor Cyan
$cleanup = Invoke-Api -Method Delete -Path "/systems/$systemId" -Headers $adminHeaders
Assert-That ($cleanup.code -eq 0) "删除测试子系统（连带 DROP 物理表）"
$tableGone = docker exec bmf-db psql -U bmf -d bmf -t -A -c "select count(*) from information_schema.tables where table_name='biz_$($tcid.ToLower())'"
Assert-That (($tableGone -join '').Trim() -eq '0') '物理表已被 DROP'

Write-Host ""
if ($failed -eq 0) {
    Write-Host "✅ 冒烟测试全部通过：$passed 项" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ 冒烟测试失败：$failed 项失败 / $passed 项通过" -ForegroundColor Red
    exit 1
}
