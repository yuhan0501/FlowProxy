# FlowProxy 使用文档

FlowProxy 是一个桌面端 HTTP/HTTPS 代理调试工具，支持：

- 系统 HTTP/HTTPS 代理一键启用/关闭
- HTTPS MITM 解密（生成并安装自签 CA）
- 请求列表与详情查看（支持 JSON/XML 格式化）
- Flow 编排：Entry → Component → Condition → Terminator
- 内置组件 + 脚本组件（带参数表单、Debug）
- Flow 级别 Debug（查看流经 Flow 前后 Request/Response）

本文档基于当前实现状态，介绍主要功能和使用方式。

---

## 1. 安装与启动

在项目目录下：

```bash
npm install
npm start
```

启动后会：

- 先打包 main + renderer
- 然后启动 Electron 应用

---

## 2. 基本界面说明

应用顶部主要有：

- **Start / Stop**：启动或停止代理服务
- 当前监听端口（默认 `8888`）

左侧菜单：

- **Dashboard**：总览、系统代理、HTTPS 解密开关
- **Requests**：请求列表和详情
- **Flows**：Flow 列表与 FlowEditor
- **Components**：组件列表、脚本编辑与 Debug
- **Settings**：配置、证书管理等

---

## 3. 系统代理与 HTTPS 解密

### 3.1 System Proxy

在 Dashboard 中可以直接开关 **System Proxy**：

- 打开时：
  - 如果代理未启动，会自动 `Start`
  - 将系统 HTTP/HTTPS 代理指向当前 FlowProxy 端口
- 关闭时：
  - 会尝试还原系统代理设置

System Proxy 卡片会显示状态：

- `OK`：系统代理已指向 FlowProxy
- `Mismatch`：存在 HTTP/HTTPS 代理，但不是 FlowProxy
- `Off`：未配置系统代理

> 注意：不同操作系统实际修改的系统代理实现不同，目前主要支持 macOS 和 Windows（WinHTTP）。

### 3.2 HTTPS Decryption（MITM）

在 Dashboard 中可以开关 **HTTPS Decryption**：

- 打开后：
  - 代理会对 HTTPS 的 CONNECT 建立本地 MITM 服务器
  - 使用自签 CA 为每个域名生成证书，对流量解密
- 关闭后：
  - HTTPS 走普通隧道模式，不解密内容

在 Settings 的证书区域，可以：

- 生成 CA 证书（如果不存在）
- 查看 CA 的路径、有效期
- 检测是否已安装到系统信任存储（最佳努力）
- 一键安装：
  - macOS：调用 `open` 打开证书，由用户在钥匙串设置为“始终信任”
  - Windows：尝试 `certutil -addstore ROOT`

HTTPS MITM 工作正常时：

- Requests 列表中会出现 `https://...` 的请求
- Flow 和 Components 对 HTTPS 请求的修改与对 HTTP 一致

---

## 4. Requests：请求列表与详情

**Requests** 页面展示最近的请求记录：

- 列表中包括：Method、URL、Status、Duration、Matched Flow 等
- 点击某一条可以查看详情：
  - Request：Method、URL、Headers（可折叠）、Body
  - Response：Status、Headers（可折叠）、Body

Body 展示：

- `application/json`：自动 `JSON.parse` 并格式化缩进
- `xml`：以 `<pre>` 文本形式展示
- 其它类型：按普通文本展示

> 对于二进制/压缩内容（图片、下载等），内部透传原始字节，`body` 可能为空，仅用于保证传输正确。

列表支持清空请求记录（通过菜单/按钮）。

---

## 5. Components：组件系统

### 5.1 组件列表

**Components** 页面列出所有组件：

- 内置组件（type = builtin）
- 自定义脚本组件（type = script）

每行组件的操作按钮：

- Bug 图标：Debug 当前组件
- Edit 图标：编辑脚本组件
- Delete 图标：删除脚本组件（内置组件不可删除）

### 5.2 新建 / 编辑脚本组件

点击 `New Component` 或编辑某个脚本组件，会打开弹窗：

- Name：组件名称
- Description：描述
- Script Code：通过 Ace Editor 编辑脚本
- Parameters：参数定义列表（用于生成 Flow 中的配置表单）

脚本格式约定：

```js
function run(config, ctx) {
  // config: 来自参数表单/Flow 配置
  // ctx.request: HttpRequest
  // ctx.response: HttpResponse | undefined
  // ctx.vars: 任意变量包，可在 Flow 中跨组件传递
  // ctx.log(msg): 打印调试日志

  return {
    request: ctx.request,  // 可选，修改后的请求
    response: ctx.response, // 可选，修改/生成响应
    vars: {},               // 可选，新增/更新的变量
    terminate: false,       // 可选，为 true 时终止后续 Flow
  };
}
```

参数定义示例：

- `name`: `foo`
- `label`: `Foo`
- `type`: `string | number | boolean | json`
- `defaultValue`: 默认值
- `description`: 帮助文本

在 Script 编辑器中：

- 自动高亮 + 基本智能提示
- 会根据 Parameters 自动提供 `config.foo`、`config.bar` 等补全

编辑弹窗底部按钮：

- `Cancel`
- `Debug`：保存当前组件配置后直接打开 Debug 弹窗
- `Save`：保存组件并关闭弹窗

### 5.3 组件 Debug

点击组件行中的 Bug 图标，或在编辑弹窗中点 `Debug`：

- 选择一条 Sample Request（从 Requests 列表中读取）
- 编辑 Component Config（JSON）
- 点击 `Run Debug`

Debug 结果展示：

- Logs：组件执行时 `ctx.log` 的输出
- Before / After：
  - Request：Method、URL、Headers（可折叠）、Body
  - Response：Status、Headers（可折叠）、Body

方便快速验证组件逻辑，不必改真实 Flow。

---

## 6. 内置组件一览

以下内置组件（builtin）均可在 Components 中看到，并可在 Flow 中直接使用，FlowEditor 的结点配置会生成相应参数表单。

### 6.1 Header Rewrite

- **ID**: `header-rewrite`
- **internalName**: `headerRewrite`
- **用途**：增加/修改/删除请求头
- **参数**：
  - `addHeaderName` (string)：要添加/修改的 header 名
  - `addHeaderValue` (string)：对应值
  - `removeHeaderNames` (string)：要删除的 header 名列表，逗号分隔

### 6.2 Mock Response

- **ID**: `mock-response`
- **internalName**: `mockResponse`
- **用途**：直接返回预设响应，终止 Flow
- **参数**：
  - `statusCode` (number，默认 200)
  - `statusMessage` (string，默认 `OK`)
  - `contentType` (string，默认 `application/json`)
  - `body` (string)：响应体
  - `headersJson` (json)：附加响应头 JSON

### 6.3 Delay

- **ID**: `delay`
- **用途**：在 Flow 中增加固定延迟
- **参数**：
  - `ms` (number，默认 1000)：延迟时间毫秒

### 6.4 URL Host Rewrite

- **ID**: `url-host-rewrite`
- **用途**：修改请求 URL 的 host/scheme，常用于切环境、灰度
- **参数**：
  - `targetHost` (string, 必填)：目标 host，可带端口，如 `dev.example.com:8080`
  - `targetScheme` (string, 默认 `https`)：`http` 或 `https`
  - `preserveHostHeader` (boolean, 默认 false)：是否保留原始 Host 头

### 6.5 URL Query Params

- **ID**: `url-query-params`
- **用途**：添加或删除 URL 上的 query 参数
- **参数**：
  - `addParamsJson` (json)：要添加的参数，如 `{ "debug": "1" }`
  - `removeParamNames` (string)：要删除的参数名，逗号分隔

### 6.6 Upstream Host Override

- **ID**: `upstream-host`
- **用途**：将请求转发到另一个 upstream host（如本地 dev server）
- **参数**：
  - `targetHost` (string, 必填)：如 `127.0.0.1:3000`
  - `targetScheme` (string, 默认 `http`)：`http` 或 `https`

### 6.7 JSON Body Modify

- **ID**: `json-body-modify`
- **用途**：修改 JSON 请求体中的字段
- **前提**：请求头 `Content-Type` 包含 `application/json`
- **参数**：
  - `jsonPath` (string, 必填)：例如 `user.name`、`items[0].price`
  - `operation` (string, 默认 `set`)：`set` | `remove` | `append`
  - `valueJson` (json)：`set/append` 时的值，如 `"Alice"`、`123`、`{"enabled":true}`

### 6.8 Response Override

- **ID**: `response-override`
- **用途**：简单地覆盖响应并终止 Flow
- **参数**：
  - `statusCode` (number, 默认 200)
  - `statusMessage` (string, 默认 `OK`)
  - `contentType` (string, 默认 `text/plain`)
  - `body` (string)：响应体

### 6.9 Header Copy

- **ID**: `header-copy`
- **用途**：将一个请求头的值复制到另一个请求头
- **参数**：
  - `sourceHeader` (string, 必填)
  - `targetHeader` (string, 必填)

### 6.10 Cookie Inject

- **ID**: `cookie-inject`
- **用途**：在请求中注入/覆盖指定 Cookie
- **参数**：
  - `cookieName` (string, 必填)
  - `cookieValue` (string, 必填)

### 6.11 Auth Inject

- **ID**: `auth-inject`
- **用途**：注入 `Authorization` 请求头
- **参数**：
  - `scheme` (string, 默认 `Bearer`)
  - `token` (string, 必填)
  - `overrideExisting` (boolean, 默认 true)：是否覆盖已存在的 Authorization

### 6.12 Bandwidth Throttle（简单版）

- **ID**: `bandwidth-throttle`
- **用途**：简单模拟慢网，增加额外延迟
- **参数**：
  - `delayMs` (number, 默认 0)：额外延迟毫秒数

### 6.13 Random Failure

- **ID**: `random-failure`
- **用途**：按照一定概率返回错误响应，用于 Chaos 测试
- **参数**：
  - `errorRate` (number, 默认 0.1)：0–1，比如 0.1 表示 10% 失败
  - `statusCode` (number, 默认 500)
  - `body` (string, 默认 `Injected failure by FlowProxy`)

### 6.14 Retry Hint

- **ID**: `retry-hint`
- **用途**：为当前请求附加重试元数据（写入 `ctx.vars.retry`），供将来使用
- **参数**：
  - `maxRetries` (number, 默认 3)
  - `retryDelayMs` (number, 默认 1000)
  - `retryOnStatusCodes` (string)：逗号分隔状态码，如 `500,502,503`

### 6.15 CORS Allow All

- **ID**: `cors-allow-all`
- **用途**：处理 OPTIONS 预检请求，添加宽松的 CORS 响应头
- **参数**：
  - `allowOrigins` (string, 默认 `*`)
  - `allowMethods` (string, 默认 `GET,POST,PUT,DELETE,OPTIONS`)
  - `allowHeaders` (string, 默认 `*`)

### 6.16 Static Local File（文本）

- **ID**: `static-local-file`
- **用途**：从本地文件系统读取文本文件作为响应返回（JS/CSS/JSON 等）
- **参数**：
  - `filePath` (string, 必填)：本地文件路径
  - `contentType` (string, 默认 `text/plain; charset=utf-8`)

> 注意：当前以 UTF-8 文本方式读取，适用于文本类资源。

### 6.17 Log Message

- **ID**: `log-message`
- **用途**：打印一条自定义日志，便于调试 Flow
- **参数**：
  - `message` (string, 必填)

### 6.18 Tag Request

- **ID**: `tag-request`
- **用途**：给当前请求加一个 Tag，写入 `ctx.vars.tags`，可在脚本中使用
- **参数**：
  - `tagKey` (string, 必填)
  - `tagValue` (string, 必填)

---

## 7. Flows：编排与 Debug

### 7.1 Flow 列表

**Flows** 页面展示所有 Flow：

- Enabled 开关：是否启用该 Flow
- Name：点击进入 FlowEditor
- Nodes：节点数
- Updated：最近更新时间
- Actions：
  - Debug（Bug 图标）：Flow 级 Debug
  - Edit：编辑 Flow
  - Copy：复制 Flow
  - Delete：删除 Flow

### 7.2 FlowEditor 与节点规则

FlowEditor 使用图形化方式编排 Flow：

节点类型：

- Entry：入口节点（匹配条件：方法、Host、Path）
- Component：组件节点（引用内置或脚本组件）
- Condition：条件节点（表达式，true/false 分支）
- Terminator：结束节点（pass-through 或 end-with-response）

连线规则（已在编辑器中强制）：

- Entry：**只能有一个下游节点**
- Component：**只能有一个上游 + 一个下游**
- Terminator：不能作为 source（没有下游）
- Condition：下游可以有多个（true/false 等分支）

FlowEditor 顶部工具条：

- `Add Node`：新增 Component / Condition / Terminator
- `Debug`：基于当前保存的 Flow 打开 Flow Debug 弹窗
- `Save`：保存当前 Flow

### 7.3 节点配置

选中节点后，右侧 Drawer 中展示配置表单：

- Entry：
  - Methods（多选）
  - Host Patterns（如 `*.example.com`）
  - Path Patterns（如 `/api/*`）
- Component：
  - Component 下拉选择
  - 自动根据组件 params 渲染配置表单（string/number/boolean/json）
- Condition：
  - Expression 文本，例如 `ctx.request.method === "POST"`
- Terminator：
  - Mode：`pass_through` | `end_with_response`

### 7.4 Flow Debug

Flow 级 Debug 可以从两处进入：

- Flows 列表中某一行的 Bug 图标
- FlowEditor 顶部的 `Debug` 按钮

步骤：

1. 选择一条 Sample Request（来自 Requests 列表）
2. 点击 `Run Debug`
3. 查看结果：
   - 执行 Flow 之后的 Request/Response（Before/After）
   - Logs（Flow 内组件执行时的日志）
   - 分为 `Before - Request/Response` 与 `After - Request/Response` 四个 Tab

> 当前 Flow Debug 展示的是整体前/后的状态。如果需要逐节点（per-node）的明细，可以后续扩展。

---

## 8. 常见问题与排查

### 8.1 开启代理后网页打不开

- 确认 Dashboard 中：
  - Proxy 已 Start
  - System Proxy 为 `OK`
- 浏览器错误如 `ERR_CERT_AUTHORITY_INVALID`：
  - 说明 HTTPS CA 未正确安装/信任，请在 Settings 中生成并安装 CA，并在系统中设为“始终信任”。
- 错误为 `ERR_CONTENT_DECODING_FAILED` 或图片加载失败：
  - 当前实现已确保二进制/压缩响应透传原始字节，不再对其做文本解码。
  - 如仍有问题，请在 Requests 中查看对应请求的响应头和状态码。

### 8.2 Flow 不生效

- 确认 Flow 的 **Enabled** 开关为开
- 确认 Entry 节点的匹配规则（方法、Host、Path）与请求实际情况相符
- 使用 Flow Debug 选取该请求，查看是否匹配到该 Flow

### 8.3 组件脚本 Debug 无效

- 确认在 Components 页面能看到 Debug 结果中的 Before/After
- 检查脚本中 `run(config, ctx)` 是否有语法错误，必要时先在简单请求上测试

---

如需扩展新的内置组件或引擎行为，可以新增 `ComponentDefinition` 到 `componentStore.ts`，并在 `src/main/components/builtins.ts` 中添加对应 `internalName` 的 handler；Flow 与 Debug 机制会自动支持。
