<p align="center">
<img width="128" height="128" alt="markdown_here_logo_icon_169967" src="https://github.com/user-attachments/assets/1e45085c-f2d5-4fd6-8c23-b0d841b82cf6" />
</p>
<h1 align="center">MarkDown 網頁轉Markdown格式</h1>

<p align="center">
<img width="584" height="448" alt="PixPin_2026-05-27_14-39-35" src="https://github.com/user-attachments/assets/b656eae1-89bf-4025-a275-87f0f69b17ff" />
</p>

## ✨ 功能

- **🚀 一鍵提取** — 點擊擴充功能圖示，自動將當前網頁轉換為 Markdown
- **📺 YouTube 支援** — 針對 YouTube 影片頁面進行優化，提取標題、頻道、描述及字幕
- **🔢 Token 統計** — 顯示 GPT token 數量（基於 o200k_base 編碼），方便評估 LLM 輸入成本
- **📋 複製到剪貼簿** — 一鍵複製轉換後的 Markdown 內容
- **💾 下載為檔案** — 將結果儲存為 `.md` 檔案

## 📥 安裝

1. 複製此倉庫或下載 ZIP 並解壓縮
2. 開啟 Chrome，進入 `chrome://extensions/`
3. 開啟右上角的「開發人員模式」
4. 點擊「載入未封裝的擴充功能」，選擇專案資料夾

## 🧭 使用方式

1. 瀏覽任意網頁，點擊工具列中的 MarkDown 圖示
2. 擴充功能會自動提取並轉換頁面內容為 Markdown
3. 使用 **Copy** 複製內容，或 **Download** 下載為 `.md` 檔案

## 🛠️ 技術棧

- [Turndown](https://github.com/mixmark-io/turndown) — HTML 轉 Markdown
- [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) — GFM 擴充（表格、刪除線、任務清單）
- [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) — GPT token 計數
- Chrome Extension Manifest V3
