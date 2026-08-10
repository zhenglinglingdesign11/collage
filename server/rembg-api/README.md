# Rembg API

小程序“主体剪”使用的去背景服务。接口兼容 `wx.uploadFile`，接收 `file` 或 `image` 字段，返回 base64 透明 PNG。

## 身份验证

`POST /remove-bg` 需要 `Authorization: Bearer <token>`。令牌由项目的 CloudBase 云函数
`rembg-auth` 以微信 `openid` 签发，服务端用相同的 `REMBG_AUTH_SECRET` 验证。

不要将该密钥写入小程序代码、镜像或仓库。部署时在 CloudBase 云函数环境变量和 Docker
容器环境变量中分别设置同一个随机值。

## 用量限制

服务按 OpenID 限制已受理的抠图请求，默认每人每天 `5` 次、每分钟 `2` 次。达到限制会返回
HTTP `429`。可通过 Docker 环境变量调整：

- `DAILY_REQUEST_LIMIT`：每日次数，设为 `0` 可关闭每日限制。
- `MINUTE_REQUEST_LIMIT`：每分钟次数，设为 `0` 可关闭分钟限制。

计数保存在 `/data/rembg-rate-limit.db`，因此必须挂载持久化数据卷。

## IP 限流与处理队列

Nginx 按源 IP 对 `/remove-bg` 限制为每分钟 `10` 次，允许短时突发 `3` 次；同一 IP 最多保持
`2` 个连接。Python 服务默认只同时处理 `1` 个模型任务，另允许 `2` 个请求排队等待；队列满时返回
HTTP `429`，等待超过 `110` 秒时返回 HTTP `503`。

Docker 环境变量：

- `PROCESSING_CONCURRENCY`：同时运行的模型任务数，默认 `1`。
- `MAX_QUEUE_SIZE`：额外排队任务数，默认 `2`。
- `QUEUE_WAIT_TIMEOUT_SECONDS`：最长排队等待秒数，默认 `110`。

将 `nginx/rate-limit.conf` 上传到服务器后，执行：

```bash
sudo cp ~/journal-collage/server/rembg-api/nginx/rate-limit.conf /etc/nginx/conf.d/rembg-rate-limit.conf
```

将 `nginx/api.mixmade.xyz.conf` 上传并覆盖到 `/etc/nginx/conf.d/api.mixmade.xyz.conf`。此模板包含
现有 HTTPS 反代以及 `/remove-bg` 的 IP 限流配置。

最后验证并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 本地构建

```bash
docker build -t journal-rembg-api .
docker run -d --name journal-rembg-api --restart always -p 127.0.0.1:8000:8000 --memory=1536m --cpus=1.5 -v rembg-rate-limit:/data -e REMBG_AUTH_SECRET='your-secret' journal-rembg-api
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

## 阿里云轻量服务器

服务器内执行：

```bash
mkdir -p ~/journal-collage/server
cd ~/journal-collage/server
```

上传本目录后：

```bash
cd ~/journal-collage/server/rembg-api
docker build -t journal-rembg-api .
docker run -d --name journal-rembg-api --restart always -p 127.0.0.1:8000:8000 --memory=1536m --cpus=1.5 \
  -v ~/journal-collage/models/u2net:/root/.u2net \
  -v ~/journal-collage/data/rembg-api:/data \
  -e REMBG_AUTH_SECRET='your-secret' \
  -e DAILY_REQUEST_LIMIT=5 \
  -e MINUTE_REQUEST_LIMIT=2 \
  -e PROCESSING_CONCURRENCY=1 \
  -e MAX_QUEUE_SIZE=2 \
  -e QUEUE_WAIT_TIMEOUT_SECONDS=110 \
  journal-rembg-api
```

保持 `TCP 8000` 仅监听本机并通过 Nginx HTTPS 代理；正式小程序需要 HTTPS 域名，并在微信
公众平台配置 `uploadFile` 合法域名。
