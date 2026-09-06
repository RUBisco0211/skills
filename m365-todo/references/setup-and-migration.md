# 当前配置、迁移与排障

以下是 2026-09-03 已验证可访问个人 Microsoft To Do 的配置。应用 ID 和租户 ID 不是密钥；access token、refresh token、设备代码和个人账号地址不写入仓库。

## 当前环境快照

| 项目 | 值 |
|---|---|
| CLI | CLI for Microsoft 365 `v11.11.0` |
| 可执行文件 | `/opt/homebrew/bin/m365` |
| Entra 应用名 | `ms-todo` |
| Application (client) ID | `f35b01ec-9e33-4d88-8d27-41c5dd5fb37c` |
| 应用注册所在 Directory (tenant) ID | `1d6e1b91-5e24-44e1-8135-ea3132bf70c9` |
| 登录 tenant | `common` |
| Cloud | `Public` |
| 登录方式 | `deviceCode` |
| 账号性质 | 个人 Microsoft 账号；不要以组织 Guest 身份访问个人 To Do |

### Entra 应用

- Supported account types：任何组织目录中的帐户和个人 Microsoft 帐户。
- Manifest 顶层：`"signInAudience": "AzureADandPersonalMicrosoftAccount"`。
- Manifest `api`：`"requestedAccessTokenVersion": 2`。
- Authentication：Mobile and desktop applications / public client；允许公共客户端流。
- Redirect URI：`http://localhost`。若兼容 device-code/native client 配置，可同时保留 `https://login.microsoftonline.com/common/oauth2/nativeclient`。
- Microsoft Graph Delegated permissions：`User.Read`、`Tasks.ReadWrite`。
- 不需要 client secret 或证书。

支持个人 Microsoft 账号时，`requestedAccessTokenVersion` 必须为 `2`。若门户报 `Property api.requestedAccessTokenVersion is invalid`，先把该字段改为 `2` 并保存，再把 `signInAudience` 改为 `AzureADandPersonalMicrosoftAccount`。

### CLI 配置

```text
clientId=f35b01ec-9e33-4d88-8d27-41c5dd5fb37c
tenantId=common
authType=deviceCode
output=text
prompt=false
showHelpOnFailure=false
printErrorsAsPlainText=true
errorOutput=stderr
```

重建配置：

```bash
m365 cli config set --key clientId --value "f35b01ec-9e33-4d88-8d27-41c5dd5fb37c"
m365 cli config set --key tenantId --value common
m365 cli config set --key authType --value deviceCode
m365 cli config set --key output --value text
m365 cli config set --key prompt --value false
m365 cli config set --key showHelpOnFailure --value false
m365 cli config set --key printErrorsAsPlainText --value true
m365 cli config set --key errorOutput --value stderr
```

## 迁移到新机器

1. 运行 `m365 version`。缺少 CLI 时告知用户将下载 Node.js 依赖并取得确认，再执行 `npm install -g @pnp/cli-microsoft365`。
2. 复用上面的 Client ID；不复制 `~/.cli-m365-connection.json`、`~/.cli-m365-all-connections.json` 或 `~/.cli-m365-msal.json`。
3. 按“CLI 配置”逐项设置。
4. 登录：

   ```bash
   m365 logout
   m365 login --authType deviceCode --tenant common
   ```

5. 让用户在 Microsoft 设备登录页输入一次性代码、选择个人 Microsoft 账号并同意 `User.Read` 与 `Tasks.ReadWrite`。
6. 验证：

   ```bash
   m365 todo list list --query 'length(@)' --output text
   ```

返回数字即迁移完成。

## 换用新的 Entra 应用

创建应用时配置：

1. Supported account types 选择“任何组织目录中的帐户和个人 Microsoft 帐户”。
2. Manifest 设置 `signInAudience=AzureADandPersonalMicrosoftAccount` 和 `api.requestedAccessTokenVersion=2`。
3. 启用 public client flow。
4. 添加 Microsoft Graph 委托权限 `User.Read` 与 `Tasks.ReadWrite`。
5. 把 CLI 的 `clientId` 改为新 Application ID，`tenantId` 保持 `common`，重新执行 device-code 登录。

## 已知问题

### Browser 登录返回 AADSTS500202

CLI v11.11.0 的 `browser` 路径对当前个人 Microsoft 账号会在授权码兑换阶段返回：

```text
AADSTS500202: personal Microsoft account ... direct Microsoft account support
```

使用已验证的 device-code 路径：

```bash
m365 logout
m365 login --authType deviceCode --tenant common
```

### `connectedAs` 为空

个人账号的 Graph access token 可能是不透明 token，CLI 无法从中解析账号字段。因此以下状态可以与有效登录同时出现：

```json
{"connectedAs":""}
```

不要仅凭该字段判定失败，改用最小 To Do 查询健康检查。

### 401、`UnknownError` 或权限不足

1. 确认 Entra 应用具有 Microsoft Graph Delegated `Tasks.ReadWrite`。
2. 执行 `m365 logout` 后重新 device-code 登录，让新权限进入 token。
3. 用 `m365 todo list list --query 'length(@)' --output text` 验证。
4. 不使用 `m365 util accesstoken get --decoded` 展示令牌。确需诊断 scope 时，在本地解析并只输出 `scp` 字段。

### `No access token found`

清除当前无效连接并重新登录：

```bash
m365 logout
m365 login --authType deviceCode --tenant common
```

在受限沙箱中若出现 `connect EPERM 127.0.0.1:7890`，认证流量只涉及少量文本，可在允许访问本机代理的终端上下文重跑。普通网络失败时遵循用户环境的代理规则：

```bash
/bin/zsh -lc 'source ~/.zshrc; proxy-on; m365 login --authType deviceCode --tenant common'
```

使用代理前先判断下载规模；登录和 Graph JSON 请求是小流量，可直接继续。
