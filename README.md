# 冰河地形實驗室 V1.0

參考 Padlet Arcade《冰河雕刻師》的地理教學概念，以 Three.js 重新實作的獨立 3D 學習遊戲。**不是 Padlet 原始程式碼的複製版本**。

## 功能
- 具有四周岩盤側壁與底面的 3D 實心地形，預設高山河谷／冰斗山區／高原峽谷。
- 抬升、侵蝕、平滑筆刷；方塊設定 X、Z、Y 與邊長，進行堆積／切除。
- 降雪、消融、冰面坡度驅動的鄰格移動、岩盤侵蝕等 **簡化教學模型**。
- 3D、俯視、側視、等高線、原地形等高線、網格、冰層切換。
- 地形編輯復原（最多 16 次）、JSON 匯出匯入、瀏覽器本機儲存。
- 不需要帳號、API 金鑰、資料庫或後端。

## 部署到 GitHub Pages
1. 在 GitHub 建立一個公開 Repository，例如 `glacier-lab`。
2. 將此資料夾內的 `index.html`、`style.css`、`main.js`、`README.md`、`.nojekyll` 放在 Repository **根目錄**。請不要只上傳 ZIP。
3. 在 Repository 進入 **Settings → Pages → Build and deployment**。
4. Source 設定 **Deploy from a branch**；Branch 選 **main**，資料夾選 **/(root)**，按 **Save**。
5. 發布後開啟 `https://你的使用者名稱.github.io/glacier-lab/`。

GitHub Pages 的設定方法參照 [GitHub 官方說明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 本機預覽
不要直接以 `file://` 雙擊 HTML。進入此專案目錄後執行：

```bash
python -m http.server 8000
```

然後開啟 `http://localhost:8000`。必須能連網，因為 three.js 使用固定版本 CDN（0.180.0）。

## 操作方式
- **觀察**：左鍵拖曳旋轉、右鍵拖曳平移、滾輪縮放；觸控單指旋轉、雙指縮放/平移。
- **筆刷**：右側選抬升/侵蝕/平滑，按住地形拖曳。
- **方塊**：指定 X/Z 平面座標、Y 目標高度、方塊邊長，選「堆積至 Y」或「侵蝕至 Y」。
- **冰河**：調整降雪、融冰、流動速度與侵蝕係數後開始演變，或手動推進 100 年。
- **儲存**：右上「儲存作品」儲存於當前瀏覽器，「讀取作品」可還原；使用「匯出 JSON」可備份檔案，再以「匯入 JSON」恢復。

## 模型限制與教學注意
- 地形是一個 65×65 高度場。底部和側壁封閉；不支援真正洞穴、懸空、隧道及體積網格。
- 簡化冰河算法：冰雪根據海拔累積/消融；冰面相對高度控制四鄰格傳輸；侵蝕由冰流通量近似。**不包含冰體黏塑性、真實地質、物質平衡驗證、冰磧堆積及沉積輸運**。
- 畫面的海拔/侵蝕量為「模型單位」，100 年是教學展示步長，**不能用於預測真實的數萬年地貌變遷**。
- 目前只有地形編輯復原，未包含模擬歷史回放；重新產生地形會清除當前資料。
- 本機儲存功能由 `localStorage` 提供；隱私模式或清除網站資料可能使其消失，請使用 JSON 檔案備份。
- 首次載入需連線到 jsDelivr CDN；沒有任何使用者資料被上傳至伺服器。

## 檔案
```
glacier-lab-v1/
├── index.html
├── style.css
├── main.js
├── .nojekyll
└── README.md
```

## 未來版本建議
課程任務與評量、實際 DEM 高程資料匯入、地形剖面線、U/V 型谷量測、冰河堆積地形、分享作品連結及教師成績表。
