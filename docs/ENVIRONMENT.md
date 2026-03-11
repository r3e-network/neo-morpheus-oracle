# Environment Guide / 环境变量指南

This guide explains the environment variables used by `neo-morpheus-oracle` in plain English and Chinese.
If you are not a developer, you do **not** need to memorize everything.
Think of the variables in four layers:

本指南用中英文解释 `neo-morpheus-oracle` 使用的环境变量。
如果你不是开发者，你**不需要**记住所有变量。
你只需要把变量理解成四层：

1. Chain addresses and RPCs / 链地址与 RPC
2. Signing keys / 签名密钥
3. Phala and Supabase access / Phala 与 Supabase 访问
4. Runtime policy knobs / 运行策略参数

## Must Know / 你必须关心的变量

These are the variables that matter for day-to-day operation.
If one of these is wrong, the system usually stops working.

这些是日常运行最关键的变量。
其中任意一个出错，系统通常就会停止工作。

### Phala Access / Phala 访问

- `PHALA_API_URL`
  English: Public URL of the Phala worker. The web app and scripts call this URL.
  中文：Phala worker 的公网地址。前端和运维脚本都会调用它。

- `PHALA_API_TOKEN` or `PHALA_SHARED_SECRET`
  English: Authentication secret for the worker.
  中文：worker 的鉴权密钥。

### Supabase / Supabase

- `SUPABASE_URL`
  English: Supabase project URL for server-side reads/writes.
  中文：Supabase 项目地址，后端和 relayer 写数据时会用到。

- `SUPABASE_SERVICE_ROLE_KEY`
  English: High-privilege Supabase key for server routes and relayer persistence.
  中文：Supabase 高权限 key，后端接口和 relayer 写运行记录时会用到。

  English: It is also used for web operation logging and encrypted-ciphertext persistence.
  中文：它也用于 web 操作日志写入和加密密文持久化。

### Admin Control Plane / 管理面权限

- `MORPHEUS_PROVIDER_CONFIG_API_KEY`
  English: Admin key for provider-config management routes.
  中文：provider 配置管理接口使用的管理员 key。

- `MORPHEUS_RELAYER_ADMIN_API_KEY`
  English: Admin key for relayer metrics, jobs, retry, and replay routes.
  中文：relayer 监控、任务、重试、重放接口使用的管理员 key。

- `MORPHEUS_SIGNING_ADMIN_API_KEY`
  English: Admin key for `/api/sign/payload`.
  中文：`/api/sign/payload` 使用的管理员 key。

- `MORPHEUS_RELAY_ADMIN_API_KEY`
  English: Admin key for `/api/relay/transaction`.
  中文：`/api/relay/transaction` 使用的管理员 key。

- `MORPHEUS_OPERATOR_API_KEY`
  English: Optional wider-scope operator key that can act as a shared fallback for relayer/signing/relay admin routes.
  中文：可选的运维总控 key，可作为 relayer / 签名 / relay 管理接口的共享回退 key。

- `ADMIN_CONSOLE_API_KEY`
  English: Legacy fallback admin key. Prefer scoped keys above in production.
  中文：旧的通用管理员 key。生产环境更建议使用上面这些分域 key。

### Neo N3 / Neo N3

- `NEO_RPC_URL`
  English: Neo N3 RPC endpoint.
  中文：Neo N3 的 RPC 地址。

- `NEO_NETWORK_MAGIC`
  English: Neo N3 network magic. Must match testnet or mainnet.
  中文：Neo N3 网络 magic，必须和当前网络一致。

- `CONTRACT_MORPHEUS_ORACLE_HASH`
  English: Neo N3 MorpheusOracle contract hash.
  中文：Neo N3 的 MorpheusOracle 合约地址。

- `CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH`
  English: Neo N3 callback consumer contract hash.
  中文：Neo N3 callback consumer 合约地址。

- `CONTRACT_MORPHEUS_DATAFEED_HASH`
  English: Neo N3 datafeed contract hash.
  中文：Neo N3 datafeed 合约地址。

- `PHALA_NEO_N3_PRIVATE_KEY` or `PHALA_NEO_N3_WIF`
  English: Worker-side Neo N3 signing material.
  中文：worker 使用的 Neo N3 签名私钥。

- `NEO_N3_WIF`
  English: Preferred generic Neo N3 operator WIF for local scripts and deploy helpers.
  中文：本地脚本和部署辅助工具优先使用的通用 Neo N3 WIF。

- `MORPHEUS_RELAYER_NEO_N3_PRIVATE_KEY` or `MORPHEUS_RELAYER_NEO_N3_WIF`
  English: Relayer/updater Neo N3 signing material.
  中文：relayer / updater 使用的 Neo N3 签名私钥。

### Neo X / Neo X

- `NEOX_RPC_URL`
  English: Neo X RPC endpoint.
  中文：Neo X 的 RPC 地址。

- `NEOX_CHAIN_ID`
  English: Neo X chain id.
  中文：Neo X 的 chain id。

- `CONTRACT_MORPHEUS_ORACLE_X_ADDRESS`
  English: Neo X MorpheusOracleX contract address.
  中文：Neo X 的 MorpheusOracleX 合约地址。

- `CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS`
  English: Neo X callback consumer contract address.
  中文：Neo X callback consumer 合约地址。

- `CONTRACT_MORPHEUS_DATAFEED_X_ADDRESS`
  English: Neo X datafeed contract address.
  中文：Neo X datafeed 合约地址。

- `PHALA_NEOX_PRIVATE_KEY`
  English: Worker-side Neo X signing key.
  中文：worker 使用的 Neo X 签名私钥。

- `MORPHEUS_RELAYER_NEOX_PRIVATE_KEY`
  English: Relayer/updater Neo X signing key.
  中文：relayer / updater 使用的 Neo X 签名私钥。

### Provider Data Source / 数据源

- `TWELVEDATA_API_KEY`
  English: API key for the default market-data provider.
  中文：默认行情数据源 TwelveData 的 API key。

## Common Tuning / 常用调节项

These variables are safe to change when tuning behavior.
They do not usually change trust assumptions.

这些变量常用于调节行为。
它们通常不会改变系统的信任模型。

### Feed Policy / Feed 策略

- `MORPHEUS_FEED_PROJECT_SLUG`
  English: Default project slug used by feed tasks.
  中文：feed 任务默认使用的项目 slug。

- `MORPHEUS_FEED_PROVIDER`
  English: Default provider for feed sync tasks.
  中文：feed 同步任务默认 provider。

- `MORPHEUS_FEED_PROVIDERS`
  English: Comma-separated provider list for multi-provider feed reads.
  中文：多 provider feed 读取时使用的 provider 列表，逗号分隔。

- `MORPHEUS_FEED_SYMBOLS`
  English: Comma-separated default pair list.
  中文：默认交易对列表，逗号分隔。

- `MORPHEUS_FEED_CHANGE_THRESHOLD_BPS`
  English: Minimum price change before a new on-chain feed update is submitted.
  中文：价格变化至少达到多少 basis points 才提交新的链上 feed 更新。

- `MORPHEUS_FEED_MIN_UPDATE_INTERVAL_MS`
  English: Minimum time between feed submissions.
  中文：两次 feed 提交之间的最短间隔。

### Relayer / Relayer

- `MORPHEUS_RELAYER_POLL_INTERVAL_MS`
  English: How often the relayer scans for new chain events.
  中文：relayer 轮询链上新事件的频率。

- `MORPHEUS_RELAYER_CONCURRENCY`
  English: Maximum number of parallel fulfill jobs.
  中文：relayer 并发处理 fulfill 的最大数量。

- `MORPHEUS_RELAYER_MAX_BLOCKS_PER_TICK`
  English: Maximum block span scanned per relayer loop.
  中文：每次 relayer 循环最多扫描多少个区块。

- `MORPHEUS_RELAYER_MAX_RETRIES`
  English: Maximum retry count for failed jobs.
  中文：失败任务最多重试次数。

- `MORPHEUS_RELAYER_RETRY_BASE_DELAY_MS`
  English: Base retry delay.
  中文：重试的基础延迟。

- `MORPHEUS_RELAYER_RETRY_MAX_DELAY_MS`
  English: Maximum retry delay.
  中文：重试的最大延迟。

- `MORPHEUS_RELAYER_NEO_N3_START_BLOCK`
  English: Optional Neo N3 start block used when the relayer has no saved checkpoint yet.
  中文：当 relayer 还没有保存过 checkpoint 时，Neo N3 扫块使用的可选起始区块。

- `MORPHEUS_RELAYER_NEO_X_START_BLOCK`
  English: Optional Neo X start block used when the relayer has no saved checkpoint yet.
  中文：当 relayer 还没有保存过 checkpoint 时，Neo X 扫块使用的可选起始区块。

### Automation / 自动化任务

- `MORPHEUS_AUTOMATION_ENABLED`
  English: Enables the relayer automation scheduler.
  中文：开启 relayer 自动化调度器。

- `MORPHEUS_AUTOMATION_BATCH_SIZE`
  English: Maximum active automation jobs loaded from Supabase per tick.
  中文：每个 tick 从 Supabase 读取的活跃自动化任务上限。

- `MORPHEUS_AUTOMATION_MAX_QUEUED_PER_TICK`
  English: Maximum number of due automation executions that may be queued on-chain per tick.
  中文：每个 tick 最多排队上链的自动化执行次数。

- `MORPHEUS_AUTOMATION_PRICE_PAIRS_PER_TICK`
  English: Reserved knob for limiting per-tick price-trigger evaluation fan-out.
  中文：限制每个 tick 价格触发检查扇出的预留参数。

- `MORPHEUS_AUTOMATION_DEFAULT_PRICE_COOLDOWN_MS`
  English: Default cooldown for price-threshold triggers when the job does not specify one.
  中文：价格阈值触发器未显式指定冷却期时使用的默认冷却时间。

### Timeouts / 超时

- `ORACLE_TIMEOUT`
  English: Upstream fetch timeout for Oracle requests.
  中文：Oracle 拉取外部数据时的超时。

- `ORACLE_SCRIPT_TIMEOUT_MS`
  English: Timeout for legacy JS oracle scripts.
  中文：旧 JS Oracle 脚本的超时。

- `COMPUTE_SCRIPT_TIMEOUT_MS`
  English: Timeout for legacy JS compute scripts.
  中文：旧 JS Compute 脚本的超时。

- `MORPHEUS_WASM_TIMEOUT_MS`
  English: Global default timeout for WASM execution. Current default is `30000`.
  中文：WASM 执行的全局默认超时。当前默认值是 `30000`。

- `ORACLE_WASM_TIMEOUT_MS`
  English: Oracle-only WASM timeout override.
  中文：只覆盖 Oracle WASM 执行超时。

- `COMPUTE_WASM_TIMEOUT_MS`
  English: Compute-only WASM timeout override.
  中文：只覆盖 Compute WASM 执行超时。

## Advanced / 高级配置

Only touch these if you understand the runtime model.

这些变量只建议在理解运行时模型后再修改。

### Derived Keys / 派生密钥

- `PHALA_USE_DERIVED_KEYS`
  English: Enables dstack-derived keys for worker and relayer signing.
  中文：开启 dstack 派生密钥，供 worker 和 relayer 用于签名。

- `PHALA_DSTACK_ENDPOINT`
  English: dstack socket/endpoint override.
  中文：dstack socket 或 endpoint 覆盖值。

- `PHALA_DSTACK_NEO_N3_KEY_PATH`
- `PHALA_DSTACK_NEOX_KEY_PATH`
- `PHALA_DSTACK_RELAYER_NEO_N3_KEY_PATH`
- `PHALA_DSTACK_RELAYER_NEOX_KEY_PATH`
  English: Override key-derivation paths for worker or relayer accounts.
  中文：覆盖 worker / relayer 的派生密钥路径。

### Attestation / 远程认证

- `PHALA_EMIT_ATTESTATION`
  English: Adds quote metadata to worker responses when requested.
  中文：在请求需要时，把 quote 元数据附加到 worker 返回里。

### Oracle Key Storage / Oracle 密钥封装存储

- `PHALA_DSTACK_ORACLE_ENCRYPTION_KEY_PATH`
  English: Derived wrapping-key path for the stable Oracle X25519 transport key.
  中文：稳定 Oracle X25519 传输密钥所使用的派生封装密钥路径。

- `PHALA_ORACLE_KEYSTORE_PATH`
  English: Filesystem path where the sealed Oracle transport key is stored.
  中文：封装后的 Oracle 传输密钥在文件系统中的存放路径。

## Deliberately Disabled By Default / 默认故意关闭的高风险项

These are intentionally left unset in production unless you explicitly want the risk.

这些变量默认不建议开启，除非你明确知道风险并接受它。

- `MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS`
  English: Enables user-supplied JS script execution. Default unset means disabled.
  中文：允许执行用户提供的 JS 脚本。默认不写就是关闭。

- `MORPHEUS_ALLOW_UNSAFE_PROVIDER_BASE_URL_OVERRIDE`
  English: Allows provider requests to override builtin base URLs. Default unset means disabled.
  中文：允许 provider 请求覆盖内置 base URL。默认不写就是关闭。

- `SCRIPT_CHILD_ENABLE_PERMISSION_MODEL`
  English: Enables Node permission model for script child processes.
  中文：为脚本子进程开启 Node permission model。

- `SCRIPT_CHILD_ALLOW_FS_READ`
- `SCRIPT_CHILD_ALLOW_FS_WRITE`
- `SCRIPT_CHILD_ALLOW_NET`
- `SCRIPT_CHILD_ALLOW_WORKER`
- `SCRIPT_CHILD_ALLOW_CHILD_PROCESS`
  English: Low-level overrides for child-process permissions.
  中文：脚本子进程底层权限覆盖项。

## Usually Safe To Ignore / 大多数时候你可以忽略

These exist for internal defaults, compatibility, or diagnostics.

这些变量主要是为了兼容、诊断或内部默认值。

- `LOG_FORMAT`, `LOG_LEVEL`
- `TXPROXY_ALLOWLIST`
- `WORKER_MAX_BODY_BYTES`
- `SCRIPT_WORKER_*`
- `WASM_CHILD_*`
- `MORPHEUS_MAX_SCRIPT_BYTES`
- `MORPHEUS_FEED_PAIR_REGISTRY_JSON`
- `MORPHEUS_RELAYER_STATE_FILE`
- `MORPHEUS_PHALA_TIMEOUT_MS`

## Practical Advice / 实操建议

If you are the operator of this stack, the shortest checklist is:

如果你是这套系统的运维者，最短的检查清单只有下面这些：

1. Make sure all contract addresses match the live deployed contracts.
   确认所有合约地址与当前实际部署一致。
2. Make sure updater / relayer keys still control the configured updater accounts.
   确认 updater / relayer 私钥仍然对应当前链上 updater 账户。
3. Make sure `PHALA_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and `TWELVEDATA_API_KEY` are valid.
   确认 `PHALA_API_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY`、`TWELVEDATA_API_KEY` 都是有效的。
4. Keep `MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS` unset unless you intentionally want user JS execution.
   除非你明确要支持用户 JS 脚本，否则保持 `MORPHEUS_ENABLE_UNTRUSTED_SCRIPTS` 不设置。
5. Tune `MORPHEUS_WASM_TIMEOUT_MS` instead of changing hardcoded timeouts in code.
   想调整 WASM 执行时间时，改 `MORPHEUS_WASM_TIMEOUT_MS`，不要改代码里的硬编码。
