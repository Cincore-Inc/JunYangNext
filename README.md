# 浚杨建筑管理系统（本地开发版）

Next.js + Ant Design Pro 本地开发项目。当前通过 SSH 隧道连接旧系统的生产 MongoDB 和 MySQL，支持项目、财务、人员、用户和角色查询，部分新增、编辑及附件上传操作会直接修改生产数据。

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:3100/login 并使用旧系统账号登录。后台页面及项目、财务和附件接口默认使用新版独立会话；旧系统会话需要重新登录。开发服务器只监听本机。数据库连接需在忽略版本管理的 `.env.local` 中配置 `MONGODB_URL` 和 `JUNYANG_MYSQL_URL`。如数据库只能通过 SSH 访问，需先建立端口转发；连接失败时页面会提示。

当前生产 MySQL 和 MongoDB 的连接目标是阿里云数据库地址，附件存放在阿里云 OSS；本地配置通过生产服务器的 SSH 隧道访问数据库。停用旧业务程序不会自动迁移或替代这些数据服务，若关闭跳板服务器，需要先为新版配置并验证其他数据库网络连接。

项目、财务及文件管理附件使用原阿里云 OSS；本地 `.env.local` 需配置 `ALI_OOS_BUCKET_NAME`、`ALI_KEY_ID` 和 `ALI_SECRECT`。认证使用新版独立会话，需配置长度至少 32 位的随机 `JUNYANG_SESSION_SECRET`；多实例需要使用相同密钥。不要提交配置或将服务暴露到公网。

历史人员图片和社保凭证使用旧路径时，需要在切换前迁移到 OSS。先运行 `node scripts/migrate-personnel-media.mjs` 检查待迁移数量；如不为零，设置 `JUNYANG_LEGACY_MEDIA_DIR` 为旧媒体根目录（其下包含 `staff/image` 和 `company/image`），或将 `JUNYANG_LEGACY_MEDIA_URL` 指向旧媒体根地址，再运行 `node scripts/migrate-personnel-media.mjs --apply`。脚本不会覆盖内容不同的已有对象，失败时可修复后重试；未迁移的旧路径不能在新版预览。当前生产数据检查结果为零条。

金额单位为分，界面换算成元。汇总包含所有记录及所有发票状态（含作废和未对账），与旧系统未过滤的汇总方式一致，不能直接视为有效发票净额。明细支持分页。

可用 `node --env-file=.env.local scripts/verify-invoice-summary.mjs` 只读比较旧版和新版票据汇总的分组及金额；抵扣日期按北京时间归并到月份。脚本不调用页面接口，不能替代筛选及页面交互验收。
可用 `node --env-file=.env.local scripts/verify-transaction-summary.mjs` 只读比较无筛选交易概览的旧版和新版汇总口径；该脚本不调用页面接口。

## 旧系统核查（2026-11-19）

旧系统包含 Django 核心、NestJS 项目/财务/文件服务，以及 MySQL、MongoDB 和阿里云对象存储。MongoDB 的项目、收票、开票、资金流水集合近半年均有新增和更新；附件也可能保存在项目及财务记录或对象存储中。记录时间不能说明查询行为。

## 当前范围与待完成

项目详情侧栏提供项目信息、投标公司、交易明细与概览、工程收开票、票据概览和分类附件。交易与发票通过项目 ID 精确筛选；项目基础信息可由系统管理员编辑，保存时检查并发修改。项目字段中的最高限价和中标价沿用旧系统以元录入的口径，财务流水和票据金额以分存储。

人员工资、社保、证件和考试支持基本维护；社保凭证支持上传和批量下载，人员资料支持图片和物品清单，证件支持批量年审状态修改。收票转账记录支持维护和凭证上传。

项目编辑与名称同步在管理员权限下进行，名称变更会在事务中更新交易及发票关联名称。项目附件删除仅移除项目关联，保留对象存储中的原文件。发票概览按旧系统的专票、普票口径分列；项目交易概览的三个旧版分组和九项金额已用隔离数据核对，生产数据尚需逐项验收。旧系统普通账号密码以明文保存，新增或修改密码仍沿用该格式，密码修改不会撤销旧系统已签发的令牌。数据库及对象存储仍使用旧系统资源；上传成功但数据库关联失败时可能留下未关联文件。正式替换旧系统前需完成所有权限、备份和业务口径验证。

部署前需对 MySQL 执行 `scripts/migrations/001-company-soft-delete.sql` 和 `scripts/migrations/002-personnel-soft-delete.sql`、`scripts/migrations/003-role-soft-delete.sql`，创建软删除标记表。旧系统不会读取该标记；并行运行期间旧系统仍可能显示已删除的公司。

配置完成后可运行 `npm run check:migration` 做只读预检：检查独立认证配置、数据库读取、MongoDB 事务能力、软删除标记表以及待迁移的人员媒体。对象存储只检查配置是否存在，不检查读写权限；预检不能替代附件、业务权限和页面操作测试。

运行 `npm run build` 后可用 `npm run test:integration` 检查旧 Core 不可用时的项目新增、改名和同步、财务筛选与新增编辑、票据复制的保存接口及附件上传、预览、下载。测试使用临时 MongoDB、模拟 MySQL 和 OSS，不连接生产数据；首次运行可能需要下载 MongoDB 测试程序。它不能替代真实存储及浏览器验收。

财务列表及项目交易明细查询可运行 `node scripts/ensure-finance-indexes.mjs` 创建所需的 MongoDB 索引；脚本会检查已有同键索引，可重复执行。

## 发布

仓库提供 GitHub Actions 的 CI 和人工确认的生产发布工作流。部署不会保存任何生产密钥在仓库中，服务器准备、GitHub Environment 和 Secrets 配置见 [docs/deployment-github-actions.md](docs/deployment-github-actions.md)。在服务器准备完成并设置好 Secrets 前，`Deploy production` 不会真正执行部署。

生产容器使用 [Dockerfile](Dockerfile) 与 [docker-compose.production.yml](docker-compose.production.yml)，只发布到服务器回环地址 `127.0.0.1:8010`，由 Nginx 承接公网 HTTPS。容器环境从服务器本地的 `.env.local` 读取，绝不提交到仓库。
