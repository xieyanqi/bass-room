# 低音练习室 · Bass Room

四弦贝斯读谱和节奏练习网站。内置谱例为原创，涵盖基础练习、日摇、J-pop 和段落衔接。

- 可上传四弦贝斯 TAB 的 PDF、PNG、JPG 或 WebP，自动生成可播放的练习谱。
- 识别器优先处理清晰、平整的 4/4 四线谱。能读到的谱面速度会设置为初始 BPM，无法确认的时值会标注为估算。变速、复杂装饰音和单独的五线谱需要另行对照。
- 可以循环整段、单小节或自选拍点，使用 40–220 BPM 的节拍器跟拍，也可以切换示范和独立读谱。
- 麦克风跟谱识别单音的音高及顺序。音频和谱面在当前浏览器内分析，最近一次导入保存在同一个浏览器里。

## 本地开发

`localhost` 指的是运行命令的电脑。先安装 Node.js 22 或更新版本和 Python 3，再下载或克隆仓库。在包含 `dist` 文件夹的项目根目录准备 PDF 组件。

```sh
npm ci --omit=optional
npm run prepare:pdf
```

Windows PowerShell

```powershell
py -m http.server 8000 --bind 127.0.0.1 --directory dist
```

macOS 或 Linux

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

看到终端显示 `Serving HTTP` 后，保持终端运行，在同一台电脑的浏览器地址栏输入 `http://localhost:8000`。服务关闭后，本地地址便无法访问。

麦克风需要从 localhost 或 HTTPS 打开。让麦克风听到贝斯音箱，或使用 USB 音频接口作为系统输入。

## 检查

```sh
npm test
```

PDF 渲染使用 [Mozilla PDF.js](https://mozilla.github.io/pdf.js/)，发布时按 `package-lock.json` 构建到 `dist/vendor/`。
