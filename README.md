# Auto-Layering Pipeline

本專案將一張動漫角色立繪拆成對位的語義 RGBA 圖層與 PSD，並提供雲端參照／本機結果的 2.5D 對照 viewer。
主要入口是 `run_seethrough_local.py`；上游推論引擎是獨立安裝的 [see-through](https://github.com/shitagaki-lab/see-through)。

## 快速開始

```powershell
python run_seethrough_local.py "inputs\character.png"
python main.py
```

完成後開啟終端印出的網址，或 `http://127.0.0.1:8010/preview?local=<task-name>`。
預設採用上游品質設定：1280 LayerDiff、30 steps、768 depth。在 12 GB GPU 使用 group offload 時，完整身體＋頭部兩階段推論可能超過一小時。

## 交付物與驗收

每次執行都建立隔離資料夾：

```text
outputs/seethrough_local/<task>/
├── *.png                    # 17 個全畫布、對位 RGBA 語義層
├── _order.json              # 圖層名稱與畫序
├── _alpha_validation.json   # 每層透明度／清理統計
├── _alpha_checkerboard.png  # 人工檢查用棋盤格
├── _previews/               # 個別圖層縮圖
└── <input>_clean.psd        # 直接由驗證後 PNG 寫出的 PSD
```

PSD **不**使用上游 `--save_to_psd`，而是由 `dev_psd_write.py` 直接寫入已驗證的 RGBA 層。清理只會移除與畫布邊界連通、已辨認為中性背景板的像素；不會依全域灰色門檻或來源色差硬擦，避免破壞衣物、髮絲與臉部補繪。

驗收要同時檢查：

1. `_alpha_validation.json` 無未解決旗標。
2. 棋盤格外部無灰／白不透明底板。
3. viewer 左（雲端）與右（本機）比較時，輪廓、嘴部／臉部、腿與腳沒有明顯品質退化。

赤腳角色的 `footwear` 層可能接近空白，這不代表腳掌遺失；應以合成結果與棋盤格確認。

## Viewer

- 左邊：`outputs/seethrough/` 的雲端參照組。
- 右邊：`?local=<task-name>` 選取的本機任務。
- 四個控制條只影響 viewer 動畫，不會修改 PNG 或 PSD；最大可動範圍為初版的一半，初始值為低幅度設定。

## 專案結構

```text
run_seethrough_local.py      主推論、隔離輸出、Alpha 驗證、PSD 寫入
dev_psd_write.py             將全畫布 RGBA PNG 寫成 PSD
preview_viewer.html          雲端／本機 2.5D 對照頁
main.py                      本機 viewer 靜態服務
tests/                       Alpha 與 PSD 回歸測試
patches/                     已核准的上游修改紀錄
skills/see-through-local/    可攜式流程 Skill 與驗收／分享參考
outputs/seethrough/          雲端參照層
outputs/seethrough_local/    本機任務、暫存 staging 與執行紀錄
```

根目錄的一些 PSD、PNG 與 legacy ComfyUI 腳本是歷史參考，保留但不作為新流程入口；請勿和新的隔離任務資料夾混用。

## 可攜 Skill

任何 agent 若要處理 see-through、PSD、Alpha 或 viewer 工作，應先讀：

```text
skills/see-through-local/SKILL.md
```

根目錄 `AGENTS.md` 也會將相關請求導向這份 Skill。Skill 記錄不可破壞的 Alpha 規則、官方品質參數、任務隔離、視覺驗收和暫時分享方式，可隨專案交接給其他 agent。

## 測試

```powershell
python -m pytest tests/test_seethrough_alpha.py -q
```

測試涵蓋邊界灰底清除、內部灰色保留、驗證產物與 PSD Alpha round-trip。

## 上游界線

上游在 `D:\ProgramsAI\see-through`。除非使用者明確授權，請不要改動其原始碼。任何已授權修改都必須以 patch 記錄在 `patches/`，並在本專案結果上驗收。
