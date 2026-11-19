# GitHub Actions 发布

仓库只保留 `Check and deploy production` 一条手动工作流。普通推送和 PR 不自动检查、不自动部署。发版时输入 `DEPLOY`，依次执行依赖安装、lint、构建和隔离集成测试，全部通过才通过 SSH 更新服务器、使用 Docker 缓存构建并重启服务。

基础镜像固定到已部署的 Node.js 22 镜像摘要，避免每次发版解析浮动标签；升级基础镜像时需主动更新 `Dockerfile` 的 `NODE_IMAGE` 默认值。依赖未变时复用 Docker 依赖层，Next.js 编译缓存通过 BuildKit cache mount 保留，首次建立缓存仍需完整编译。服务器日志分别输出代码更新、镜像构建和重启检查耗时。

拉取代码使用 HTTP/1.1，仅获取待发布的提交；单次最多等待 45 秒，失败后最多重试三次。

这套流程不迁移数据库、不会执行 MongoDB 索引脚本，也不会修改 MySQL/OSS 数据。数据库迁移和生产验收应单独执行并留存备份。

## 一次性服务器准备

1. 用受限的部署用户克隆仓库到固定目录，例如 `/srv/junyang-next`；该用户应能读取仓库。
2. 在该目录创建 `.env.local`，填入 MySQL、MongoDB、OSS 和 `JUNYANG_SESSION_SECRET`。该文件不进入 Git。
3. 新版以 Docker 容器运行（基础镜像为 Node.js 22），无需在主机安装 Node。将容器仅映射到 `127.0.0.1:8010`，由 Nginx 承接公网请求。
4. 仅给部署用户授予重建新版容器的免密 sudo 权限，例如：

   ```sudoers
   deployuser ALL=(root) NOPASSWD: /usr/bin/docker
   ```

5. 为部署用户建立专用 SSH 密钥；不要复用个人 root 密钥。

## GitHub Environment 和 Secrets

在仓库 `Settings → Environments → production` 创建 `production` 环境，建议要求人工审批，然后配置以下环境级 Secrets：

| Secret | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 服务器 IP 或域名 |
| `DEPLOY_PORT` | SSH 端口；未填默认 22 |
| `DEPLOY_USER` | 受限部署用户 |
| `DEPLOY_SSH_KEY` | 专用部署私钥全文 |
| `DEPLOY_KNOWN_HOSTS` | 服务器 SSH host key 的 `known_hosts` 行，避免运行时 `ssh-keyscan` 信任未知主机 |
| `DEPLOY_PATH` | 服务器上仓库绝对路径，例如 `/srv/junyang-next` |

不要将 `.env.local`、数据库连接串、OSS Key 或生产管理员密码放入 Actions 变量或仓库文件。

## 发布步骤

1. 将要发布的提交推送到 `main`。
2. 打开 GitHub 的 `Actions → Check and deploy production → Run workflow`，选择要发布的分支、标签或完整 40 位 commit SHA（不使用短 SHA）。
3. 在确认框输入 `DEPLOY`。
4. 查看 workflow 的远程健康检查结果；失败时不会切换 Nginx。正式发布前建议使用镜像版本标签和保留上一版镜像，作为回滚基础。

当前工作流直接切换部署目录的 Git commit 并重建容器，适合第一版独立迁移。完成生产切换后，可再升级为不可变镜像标签加原子切换，以支持一键回滚。
