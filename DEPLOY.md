# 部署手册（Docker Compose + 公网 IP 访问，不用域名、不用备案）

> 目标形态：一台 2 核 4G 的云服务器（Ubuntu 22.04），
> 用 Docker Compose 跑「PostgreSQL(pgvector) + 后端 + 前端/Nginx」三个容器，
> 对外只开一个端口：
>
> - `http://公网IP:8090` —— 打开就是登录页
>
> 本手册里的命令，**没有特别说明时都在服务器上执行**，且工作目录是项目根目录（`~/bmf`）。
>
> 📌 **已经部署过、只是要更新代码？** 直接看下面第一节「⭐ 日常更新」。
>
> ⚠️ **验证状态**：本手册里的 Docker 相关命令是按照 `docker-compose.yml`、两个 `Dockerfile`、
> `nginx.conf` 编写的，但**开发机上没有运行中的 Docker，这些命令没有在本机实际跑过**。
> 本机实际验证过的是：后端 `prisma validate` / `nest build` / 47 个单测、
> 前端 `vite build` / 18 个单测、以及后端无库启动冒烟（健康接口 200、受保护接口 401）。
> 第一次上线请按第 5 节的「自检」逐条确认，不要跳过。

---

## ⭐ 日常更新：改完代码怎么上线（最常用，先看这里）

部署完成之后，**唯一需要反复操作**的流程。

### 两步走

```bash
# ① 本机：改完代码，提交并推送
git add .
git commit -m "改了什么"
git push

# ② 服务器：拉代码 + 重建 + 重启 + 自检，一条命令
bash ~/bmf/update.sh
```

`update.sh` 依次执行：`git pull` → `docker compose up -d --build` → 等后端就绪（最多 90 秒）
→ 打印容器状态 → 自检（Nginx `/healthz`、后端 `/api/health`）。

> 📄 这个脚本就在仓库根目录（`update.sh`），随 `git pull` 一起更新，不用手工维护。

> ⏳ **为什么要等**：容器「已启动」和「能接请求」是两件事。
> 后端启动时要连数据库、执行 `prisma migrate deploy`，这几秒内访问接口 Nginx 会返回 **502**。
> 不等就会把正常重启误判成"更新失败"。

### 只改了前端（后端完全不碰）

```bash
cd ~/bmf && git pull && docker compose up -d --build web
```

前端镜像里是构建好的静态文件，所以改前端也要重建镜像（和 jisu 那种挂载 dist 的方式不同，
这里选择"镜像自包含"，避免服务器上残留旧文件）。

### 什么样的改动需要重建镜像？

| 改了什么 | 要重建镜像吗 | 服务器上执行 |
|---|---|---|
| 后端代码 `server/src/**` | ✅ 要 | `docker compose up -d --build server` |
| 后端 `prisma/schema.prisma`、`prisma/migrations/**` | ✅ 要 | `docker compose up -d --build server`（启动时自动 `migrate deploy`） |
| 前端代码 `client/src/**` | ✅ 要 | `docker compose up -d --build web` |
| `client/nginx.conf` | ✅ 要（打进镜像） | `docker compose up -d --build web` |
| `docker-compose.yml`（端口、环境变量映射） | ❌ 不用 | `docker compose up -d` |
| 根目录 `.env`（JWT_SECRET、数据库密码、超管账号） | ❌ 不用 | `docker compose up -d --force-recreate server`（环境变量只在创建容器时注入） |
| `DEPLOY.md`、`README.md` | ❌ 不用 | 什么都不用做 |

> **为什么改代码必须重建？** 源码是在构建镜像时 `COPY` 进去的，不是挂载目录。
> 只 `restart` 容器，跑的还是镜像里的旧代码。

---

## 0. 部署形态总览

三个容器，一条内网链路：

```
浏览器 ──http :8090──▶ [web: nginx]
                        │  /api/*  反向代理（容器内网）
                        ▼
                     [server: nestjs :3000]
                        │  postgres 协议
                        ▼
                     [db: pgvector/pg16 :5432]
                        └── 数据卷 bmf-pgdata（持久化）
```

| 容器 | 镜像来源 | 对外端口 | 说明 |
|---|---|---|---|
| `bmf-web` | `./client/Dockerfile` | **8090:80** | Vite 构建产物 + Nginx，反代 `/api` |
| `bmf-server` | `./server/Dockerfile` | 不暴露 | Dockerfile 启动命令会先 `prisma migrate deploy` |
| `bmf-db` | `pgvector/pgvector:pg16` | `127.0.0.1:5434` | 只绑本机回环，公网访问不到；5434 避免和宿主机已有 PG 撞端口 |

为什么数据库也用 pgvector 镜像：**`sys_vector_document` 表用了 `vector(1024)` 列**，
普通 `postgres` 镜像里没有这个类型，建表会直接失败。

---

## 1. 买服务器时怎么选

| 选项 | 选什么 | 为什么 |
|---|---|---|
| 实例 | 2 vCPU / 4 GiB 起 | 后端 + 数据库 + 构建都在一台机器上，2G 构建镜像时容易 OOM |
| 镜像 | **Ubuntu 22.04 64 位** | 装 Docker 的资料最多 |
| 系统盘 | 40G 起 | 镜像 + 数据库 + 日志 |
| 公网 IP | **分配公网 IPv4** | 不勾就没法从外网访问 |
| 带宽 | 3M 起 | 后台系统以文字为主，3M 够用 |
| 内存优化 | **开启 Swap** | 2~4G 内存构建 Node 镜像时的保命项 |

---

## 2. 装 Docker

```bash
# 用官方脚本（国内网络慢的话先换镜像源）
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun

# 启动并设开机自启
systemctl enable --now docker

# 确认 compose 插件可用（本手册用的是 v2 语法：docker compose，中间是空格）
docker compose version
```

给国内服务器配镜像加速（可选，不配构建会明显变慢）：

```bash
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]
}
EOF
systemctl restart docker
```

---

## 3. 拉代码 + 配环境变量

```bash
cd ~
git clone <你的仓库地址> bmf
cd bmf

# 复制环境变量模板并修改
cp .env.example .env
vi .env
```

**必须改的至少一项**：

```ini
# 换成随机长字符串，否则 token 可被伪造
JWT_SECRET=$(openssl rand -hex 32)
```

`.env` 里各项的含义：

| 变量 | 默认 | 说明 |
|---|---|---|
| `POSTGRES_USER` | `bmf` | 数据库用户名 |
| `POSTGRES_PASSWORD` | `bmf_password` | **建议改掉**；只在数据卷第一次创建时生效 |
| `POSTGRES_DB` | `bmf` | 数据库名 |
| `JWT_SECRET` | 无（必填） | token 签名密钥，改了所有用户掉线 |
| `JWT_EXPIRES_IN` | `8h` | 登录有效期 |
| `CORS_ORIGIN` | `http://localhost:8090` | 同域部署保持默认即可 |
| `SUPER_ADMIN_USERNAME` | `yy1` | 超管用户名（只在首次 seed 时生效） |
| `SUPER_ADMIN_PASSWORD` | `yy1129273677` | 超管初始密码，**上线后请立刻改** |

> ⚠️ **`.env` 不进 git**（`.gitignore` 已挡住），每台机器各有一份，不要跟着代码同步。

---

## 4. 启动 + 首次初始化

```bash
cd ~/bmf

# 构建并启动三个容器（第一次会慢，5~10 分钟，取决于网络）
docker compose up -d --build

# 看状态：三个都应该是 Up，db 应该是 healthy
docker compose ps
```

后端容器启动时会自动执行 `prisma migrate deploy` 建表（包括 `CREATE EXTENSION vector`）。
**但种子数据不会自动创建**——超管账号需要手动跑一次：

```bash
# 只做一次：创建主系统 + 超管账号 + demo 子系统 + 示例表格/路由/字典
docker compose exec server npm run seed
```

成功的话会看到：

```
=== 开始初始化数据 ===
✔ 主系统 / 超管账号：yy1
✔ 演示子系统：demo / 演示账号：demo
✔ 字典：order_status（4 个选项）
✔ 示例表格数据：3 条
✔ 表格配置：TCID = TDEMOORDERS
✔ 示例路由：/order/list（表格）、/custom/demo（自定义页面）
=== 初始化完成 ===
```

> 种子脚本可重复执行（内部用 upsert），不会把已有数据弄丢；
> 示例表格数据只在表为空时插入。

---

## 5. 首次上线自检（按顺序做，别跳）

```bash
# ① Nginx 活着吗
curl -fsS http://127.0.0.1:8090/healthz && echo " <- nginx ok"

# ② 后端活着吗（应该看到 "status":"ok"、"db":true、"pgvector":true）
curl -fsS http://127.0.0.1:8090/api/health

# ③ 登录能力（应该返回 token）
curl -fsS -X POST http://127.0.0.1:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"yy1","password":"yy1129273677"}'

# ④ 带 token 拿子系统列表（应该返回 1 条 main）
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"yy1","password":"yy1129273677"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -fsS http://127.0.0.1:8090/api/systems -H "Authorization: Bearer $TOKEN"

# ⑤ 用示例 TCID 取渲染配置（验证"配置驱动表格"这条链路）
curl -fsS -X POST http://127.0.0.1:8090/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123456","systemCode":"demo"}' | head -c 300
```

浏览器打开 `http://公网IP:8090`，用超管 `yy1 / yy1129273677`（系统编码留空）登录。

> 🧪 **更完整的验证**：本地或跳板机上可以跑 `server/scripts/smoke-test.ps1`，
> 它会真实走一遍「建子系统 → 配表格拿 TCID → 增删改查 → 建路由 → 安全用例」，
> 共 31 项断言，跑完自动清理测试数据。用法见 `server/README.md` 第 7.4.1 节。

---

## 6. 端口与防火墙

| 端口 | 用途 | 要不要对公网开放 |
|---|---|---|
| 8090 | 前端 + 后端 API（经 Nginx） | ✅ **要** |
| 3000 | 后端直连 | ❌ 不需要（`docker-compose.yml` 里没暴露） |
| 5434 | 数据库（宿主机回环） | ❌ **绝对不要** |

云厂商的安全组要放行 8090；Ubuntu 自带 ufw 如果开了：

```bash
ufw allow 8090/tcp
ufw reload
```

> 数据库只绑 `127.0.0.1:5434`，即使安全组全开也访问不到；
> 真的要远程连库排查，用 SSH 隧道：`ssh -L 5434:127.0.0.1:5434 root@IP`。

---

## 7. 数据库迁移与备份

### 7.1 迁移怎么发生的

- 迁移文件在 `server/prisma/migrations/`
- 后端容器**每次启动**都会执行 `prisma migrate deploy`（幂等，已执行的会跳过）
- 新增迁移的流程（本机）：
  ```bash
  cd server
  # 1. 改 prisma/schema.prisma
  # 2. 离线生成 SQL（不需要连库）
  npm run prisma:migrate:diff > prisma/migrations/0002_xxx/migration.sql
  # 3. 打开文件确认内容（尤其是 DROP/ALTER 这类破坏性语句）
  # 4. 提交，服务器上 update.sh 会自动执行
  ```

### 7.2 备份

```bash
# 备份（输出到服务器当前目录）
docker compose exec -T db pg_dump -U bmf -d bmf > backup-$(date +%F).sql

# 建议再加一层压缩和异地保存
gzip backup-$(date +%F).sql
```

### 7.3 恢复

```bash
# ⚠️ 恢复会覆盖现有数据，先确认备份可用
docker compose exec -T db psql -U bmf -d bmf < backup-2025-01-01.sql
```

> 注意：业务物理表（`biz_<tcid>`）也在同一个库里，`pg_dump` 会一起导出，
> 所以恢复后表格数据也回来了——前提是你备份的是整库。

---

## 8. 常见坑（按踩到的概率排序）

1. **改了 `.env` 没生效**
   环境变量是**创建容器那一刻**注入的，`docker compose restart` 不生效。
   要用 `docker compose up -d --force-recreate server`（`update.sh` 里已经包含了这一步）。

2. **改了数据库密码，容器起不来**
   PostgreSQL 只在**数据卷第一次创建时**读 `POSTGRES_PASSWORD`。
   要改密码必须重建数据卷：`docker compose down -v`（**会清空数据库**，务必先备份）。

3. **建表失败：`type "vector" does not exist`**
   用的不是 `pgvector/pgvector:pg16` 镜像，或者数据卷是旧的普通 postgres 卷。
   确认镜像名，必要时重建数据卷。

4. **`prisma migrate deploy` 报数据库连不上**
   后端容器可能在 db 还没 healthy 时就启动了。`docker-compose.yml` 里已有
   `depends_on: db: condition: service_healthy`，如果还遇到，先 `docker compose logs db` 看数据库日志。

5. **端口冲突**
   宿主机已经有 8090 或 5434 被占用。改 `docker-compose.yml` 里端口映射的**左边**（宿主机侧）即可。

6. **访问 502**
   Nginx 活着但后端还没起来（正在跑迁移）或后端崩了：
   ```bash
   docker compose ps
   docker compose logs --tail=100 server
   ```

7. **登录后立刻被踢回登录页**
   `JWT_SECRET` 变过，或者服务器时间不对（token 有有效期）。检查 `date`。

8. **构建时 OOM 被杀**
   2G 内存机器构建 Nest 镜像容易炸。开 Swap，或者本地构建好镜像推到镜像仓库再拉。

9. **超管密码忘了**
   两种办法：
   - 有 demo 账号：用它登录不解决超管权限问题
   - 直接改库（bcrypt 哈希需要先生成）：
     ```bash
     docker compose exec server npm run seed   # 注意：不会改已有密码
     ```
     正确做法是进容器生成哈希后更新：
     ```bash
     docker compose exec server node -e "console.log(require('bcryptjs').hashSync('新密码',10))"
     docker compose exec -T db psql -U bmf -d bmf \
       -c "UPDATE sys_user SET password_hash='<上一步输出>' WHERE username='yy1';"
     ```

---

## 9. 上线前安全检查清单

- [ ] `JWT_SECRET` 已换成随机长串（不是示例值）
- [ ] 超管密码 `yy1129273677` **已修改**（登录后调 `POST /api/auth/password`）
- [ ] demo 子系统 / demo 账号已删除或改密码（如果不需要演示）
- [ ] 数据库端口没有对公网开放（`docker compose ps` 看端口绑定是不是 `127.0.0.1:5434`）
- [ ] 服务器时间已校准（`timedatectl`，时区建议 `Asia/Shanghai`）
- [ ] 已做一次全库备份并确认文件大小正常
- [ ] 8090 是明文 HTTP：如果传输内容敏感，建议加成 HTTPS（自签证书或云厂商证书）

---

## 10. 目录结构（部署视角）

```
~/bmf/
├── .env                     # 本机环境变量（不进 git，必须存在）
├── docker-compose.yml       # 三个容器的编排
├── update.sh                # 日常更新脚本
├── DEPLOY.md                # 本文件
├── server/                  # 后端源码 + Dockerfile + prisma 迁移
├── client/                  # 前端源码 + Dockerfile + nginx.conf
├── docs/                    # 设计文档（术语表、领域模型、时序图、ADR…）
└── AGENTS.md                # 给 AI 协作者的约定（技术栈、命令、术语、禁止事项）
```
