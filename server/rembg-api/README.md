# Rembg API

小程序“主体剪”使用的去背景服务。接口兼容 `wx.uploadFile`，接收 `file` 或 `image` 字段，返回 base64 透明 PNG。

## 本地构建

```bash
docker build -t journal-rembg-api .
docker run -d --name journal-rembg-api --restart always -p 8000:8000 --memory=1536m --cpus=1.5 journal-rembg-api
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
docker run -d --name journal-rembg-api --restart always -p 8000:8000 --memory=1536m --cpus=1.5 journal-rembg-api
```

开发测试可在阿里云轻量服务器防火墙开放 `TCP 8000`，然后访问：

```text
http://139.196.120.60:8000/health
```

正式小程序需要 HTTPS 域名，并在微信公众平台配置 `uploadFile` 合法域名。
