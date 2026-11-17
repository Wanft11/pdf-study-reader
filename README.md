# PDF Study Reader

把课件 PDF 变成独立的离线 HTML。保留原页，按页生成讲解和自测，可搜索、收藏、记录笔记、高亮原文并把摘录排进双面 A4 cheat sheet。

在 Codex 中，把这个目录放进项目的 `.agents/skills/`，或复制到个人的 `~/.codex/skills/`。然后把 PDF 加到对话里，发送：

> 用 $pdf-study-reader 把这些 PDF 做成中文标准版离线讲义。先给我目录和三页预览，重点页精讲。

也可直接把目录和 PDF 给 Agent，请它按里面的 `SKILL.md` 运行。

需要 Python 3.11 以上。优先使用已经带有 pdfplumber 的 Codex 运行时。使用系统 Python 时，可在虚拟环境里安装：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

单独跑工具时，用以下方式生成轻量版。标准版和精讲版再传入按页编写的 notes JSON。

```sh
python scripts/reader.py prepare --work ./reader-work --title "My course" "Lecture 1.pdf"
python scripts/reader.py build --work ./reader-work --mode light --languages en --out ./study-reader.html
```

新增课件时复用同一个 work 目录，再运行 `prepare`。已有文档会按文件摘要去重。保留 work 目录和 notes JSON 以便后续增量更新。Skill 默认生成可转发的 ZIP，内含 HTML 和按启用功能编写的使用说明。手动运行脚本时可用 `--zip` 生成同样的包。课程 PDF、笔记或个人配置可以留在本地工作目录。通过浏览器打开 HTML 即可。成品首次打开时会显示分步引导，可跳过，也可通过「更多 → 使用引导」重看。个人笔记默认保存在当前浏览器，同一浏览器尽量使用同一路径打开。首次导入会询问是否生成中英双语、是否加入 AI 提问。选择加入后，直接用浏览器打开 HTML，点击「AI 提问」，再把问题和当前页内容复制到自己的 AI 对话获取回答。无需启动器，也无需配置 API Key。扫描页保留原图，不能在图上直接选择原文。

也可以直接试运行仓库里的原创三页示例：

```sh
python scripts/reader.py prepare --work ./weighted-work --title "Weighted means" examples/weighted-means.pdf
python scripts/reader.py build --work ./weighted-work --notes examples/weighted-means-notes.json --languages zh,en --ai-handoff --out weighted-means.html
```
