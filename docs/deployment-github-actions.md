# GitHub Actions 发布

仓库有两条工作流：

- `CI`：推送到 `main` 或创建 PR 时，执行 `npm ci`、lint、构建和隔离集成测试；不会访问生产环境。
- `Deploy production`：只能手动触发，并且必须输入 `DEPLOY` 确认。它在 GitHub Runner 上重新完成同一套校验，再通过 SSH 将服务器工作树切换到该提交、安装生产依赖、构建并重启服务。

这套流程不迁移数据库、不会执行 MongoDB 索引脚本，也不会修改 MySQL/OSS 数据。数据库迁移和生产验收应单独执行并留存备份。

## 一次性服务器准备

1. 用受限的部署用户克隆仓库到固定目录，例如 `/srv/junyang-next`；该用户应能读取仓库。
2. 在该目录创建 `.env.local`，填入 MySQL、MongoDB、OSS 和 `JUNYANG_SESSION_SECRET`。该文件不进入 Git。
3. 将 Node.js 22 安装在服务器上，并创建 systemd 服务。服务的 `WorkingDirectory` 应为部署目录，`ExecStart` 为 `npm run start`，并使它监听 `127.0.0.1:3100`。
4. 仅给部署用户授予重启这一个服务的免密 sudo 权限，例如：

   ```sudoers
   deployuser ALL=(root) NOPASSWD: /bin/systemctl restart junyang-next.service
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
| `DEPLOY_SERVICE` | systemd 服务名，例如 `junyang-next.service` |

不要将 `.env.local`、数据库连接串、OSS Key 或生产管理员密码放入 Actions 变量或仓库文件。

## 发布步骤

1. 合并通过 CI 的提交到 `main`。
2. 打开 GitHub 的 `Actions → Deploy production → Run workflow`，选择要发布的 commit/ref。
3. 在确认框输入 `DEPLOY`。
4. 查看 workflow 的远程健康检查结果；失败时服务器服务会保留在重启前的代码还是新代码，取决于失败位置。因此正式发布前建议使用服务管理器的版本目录/回滚策略进行增强。

当前工作流直接切换部署目录的 Git commit，适合第一版独立迁移。完成生产切换后，可再升级为不可变构建产物加原子软链接部署，以支持一键回滚。
