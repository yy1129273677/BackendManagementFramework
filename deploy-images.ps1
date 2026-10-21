# =============================================================================
# deploy-images.ps1 —— 一键发布（本机构建镜像 → 上传 → 服务器导入并重启）
#
# 为什么不用「服务器上 docker compose build」：
#   这台服务器拉 Docker Hub 基础镜像极慢（实测 node:22-alpine 的 55MB 层
#   拉了 10 分钟还是 0B），而本机构建很快。所以沿用 jisu 项目的做法：
#   本机 build → docker save → scp 上传 → 服务器 docker load → 重启容器。
#
# 怎么用（在项目根目录的 PowerShell 里）：
#   .\deploy-images.ps1                      # 更新前后端
#   .\deploy-images.ps1 -Only web            # 只更新前端
#   .\deploy-images.ps1 -SkipBuild           # 不重新构建，直接上传现有镜像
#
# 第一次用之前处理执行策略（任选其一）：
#   A. Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#   B. powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-images.ps1
#
# 前提：
#   1. 本机 Docker Desktop 在运行（docker version 能通）
#   2. 本机能用 -Key 指定的私钥免密登录服务器（jisu 部署用的那把即可）
#   3. 服务器上项目目录已有 .env 和数据库（本脚本只管镜像 + 重启容器）
# =============================================================================

param(
    # 服务器公网 IP
    [string]$Server = "8.147.114.201",
    # SSH 用户名
    [string]$User = "root",
    # SSH 私钥路径（jisu 部署用的那把）
    [string]$Key = "E:\study\project\.ssh-deploy\jisu_deploy",
    # 服务器上的项目目录（里面有 docker-compose.yml 和 .env）
    [string]$RemoteDir = "/root/bmf",
    # 只更新哪个服务：all / server / web
    [ValidateSet("all", "server", "web")]
    [string]$Only = "all",
    # 跳过构建，直接上传当前本地镜像（调试用）
    [switch]$SkipBuild,
    # 对外访问端口（只用于最后的健康检查）
    [int]$Port = 8081
)

# 注意：这里不能设 "Stop"。
# docker / scp / ssh 会把正常进度信息打到 stderr，PowerShell 5.1 在 Stop 模式下
# 会把它们当成错误直接终止脚本（报 NativeCommandError）。
# 所以改成 Continue，靠每一步后面的 $LASTEXITCODE 判断成功失败。
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

# 需要构建/上传的镜像名（和 docker-compose.yml 里的 image: 保持一致）
$allImages = @("bmf-server:latest", "bmf-web:latest")
$images = switch ($Only) {
    "server" { @("bmf-server:latest") }
    "web" { @("bmf-web:latest") }
    default { $allImages }
}
$services = switch ($Only) {
    "server" { @("server") }
    "web" { @("web") }
    default { @("server", "web") }
}

# Windows 的 ~/.ssh/config 如果权限不对，ssh 会直接报错。
# 用一份临时空配置绕开它，不影响用户其它 SSH 设置。
$sshCfg = Join-Path $env:TEMP "bmf-ssh-config"
if (-not (Test-Path $sshCfg)) { "" | Set-Content -LiteralPath $sshCfg -Encoding ascii }
$knownHosts = Join-Path $env:TEMP "bmf_known_hosts"
if (-not (Test-Path $knownHosts)) { "" | Set-Content -LiteralPath $knownHosts -Encoding ascii }
$sshOpts = @(
    "-F", $sshCfg,
    "-i", $Key,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "UserKnownHostsFile=$knownHosts",
    "-o", "ConnectTimeout=15"
)

# ---------- 1. 构建镜像 ----------
if (-not $SkipBuild) {
    Write-Host "[1/4] 本机构建镜像（$($services -join ', ')）…" -ForegroundColor Cyan
    # 注意：这里必须写 $services，不能写 @services。
    # switch 只命中一个分支时，$services 会被展开成单个字符串（如 "server"），
    # 而 @services 这种 splatting 会把字符串当成字符集合，逐个字符传出去，
    # docker 收到的是 s、e、r、v、e、r，于是报 "no such service: s"。
    & docker compose build $services
    if ($LASTEXITCODE -ne 0) { throw "docker compose build 失败，已中止（服务器没有任何改动）" }
} else {
    Write-Host "[1/4] 跳过构建，使用本地现有镜像" -ForegroundColor Yellow
}

# ---------- 2. 导出并压缩 ----------
Write-Host "[2/4] 导出镜像…" -ForegroundColor Cyan
$tar = Join-Path $PSScriptRoot "bmf-images.tar"
$gz = Join-Path $PSScriptRoot "bmf-images.tar.gz"
if (Test-Path $tar) { Remove-Item $tar -Force }
if (Test-Path $gz) { Remove-Item $gz -Force }

# 同样不能写 @images：-Only server / web 时它是单个字符串，splatting 会拆成字符。
& docker save -o $tar $images
if ($LASTEXITCODE -ne 0) { throw "docker save 失败" }

# 注意：这里打出来的是「tar 里套一个 tar」。
# 服务器上要先 tar -xzf 解出内层 tar，再 docker load（脚本第 3 步已处理）。
# 用 -C 指定目录、只传文件名：否则 Windows 自带 tar 会把绝对路径
# （如 study/project/.../bmf-images.tar）打进包里，服务器解压后文件就跑到嵌套目录里了。
& tar -czf $gz -C $PSScriptRoot "bmf-images.tar"
if ($LASTEXITCODE -ne 0) { throw "压缩失败（Windows 自带 tar 不可用？）" }
Remove-Item $tar -Force
$sizeMb = [math]::Round((Get-Item $gz).Length / 1MB, 1)
Write-Host "      压缩包 $sizeMb MB" -ForegroundColor Gray

# ---------- 3. 上传并在服务器上导入 ----------
Write-Host "[3/4] 上传到服务器并导入…" -ForegroundColor Cyan
& scp @sshOpts $gz "${User}@${Server}:/root/bmf-images.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传失败" }

# 远程脚本：解压 → 导入 → 重建容器 → 等后端就绪。
# 用 base64 传给服务器，避免中文/引号在 PowerShell → bash 之间被转义坏。
$remoteScript = @"
set -euo pipefail
cd /root
tar -xzf bmf-images.tar.gz
docker load -i bmf-images.tar | tail -3
rm -f bmf-images.tar bmf-images.tar.gz

cd $RemoteDir
docker compose up -d --force-recreate $($services -join ' ')
echo '等待后端就绪（最多 90 秒）…'
for i in `$(seq 1 30); do
  if docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "后端已就绪"
    break
  fi
  sleep 3
done
docker compose ps
curl -fsS http://127.0.0.1:$Port/api/health && echo
"@
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
& ssh @sshOpts "${User}@${Server}" "echo $b64 | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { throw "服务器导入/重启失败，看上面输出排查" }

# ---------- 4. 从本机验证公网入口 ----------
Write-Host "[4/4] 验证公网入口 http://${Server}:$Port …" -ForegroundColor Cyan
try {
    $health = Invoke-WebRequest -Uri "http://${Server}:$Port/api/health" -TimeoutSec 15 -UseBasicParsing
    $page = Invoke-WebRequest -Uri "http://${Server}:$Port/" -TimeoutSec 15 -UseBasicParsing
    Write-Host "      /api/health -> HTTP $($health.StatusCode)" -ForegroundColor Green
    Write-Host "      首页        -> HTTP $($page.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "      公网访问失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      服务器内部若正常，请检查云厂商安全组是否放行 $Port 端口" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n发布完成：http://${Server}:$Port" -ForegroundColor Green
Write-Host "超管账号：yy1 / yy1129273677（系统编码留空）" -ForegroundColor Gray
