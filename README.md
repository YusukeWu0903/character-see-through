# Auto-Layering Pipeline

本專案是本機整合與品質驗證工作流：把一張動漫角色立繪拆成對位的語義 RGBA 圖層與 PSD，並提供雲端參照／本機結果的 2.5D 對照 viewer。
核心分解模型採用 [Shitagaki Lab 的 see-through](https://github.com/shitagaki-lab/see-through)；本 repo **不是**該模型的重製或再發布，而是用它驗證、清理、匯出與檢查我們自己的自動化流程。

## 致謝與外部依賴

- 上游研究與模型：Jian Lin 等人的 [see-through](https://github.com/shitagaki-lab/see-through)（SIGGRAPH 2026，Apache-2.0）。
- 請依上游專案的授權、模型條款與引用要求使用其程式與權重。
- 本 repo 不包含上游程式碼、模型權重或任何角色素材；它只呼叫使用者自行安裝的 upstream checkout。

## 快速開始

```powershell
set SEE_THROUGH_HOME=C:\path\to\see-through
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

### 協調動作實驗版

已將原品質版標記為 `milestone/clean-layers-v1`（`deab315`）。
`codex/hierarchical-rig-v1` 分支開發父子階層動畫，完整規格、官方資料來源與
分階段驗收見 [角色動態規格](docs/rig-roadmap.md)。

新入口 `/preview-rig?local=<task-name>` 提供頭部／身體側傾、同相位起伏、
附著於頭部的髮擺，及雲端／本機或舊／新動作比較。Eris 專用原型尚待人工驗收。
原 `/preview` 保持不變。Git 只保護程式；忽略的 PNG／PSD 必須另行保存。
核心測試：`node --test tests/test_rig.mjs`。

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

「上游界線」指的是：see-through 是獨立的外部依賴，不屬於本 repo 的原始碼或交付物。請以 `SEE_THROUGH_HOME` 指向你自行安裝的 checkout。除非使用者明確授權，請不要改動其原始碼；任何已授權修改都必須以 patch 記錄在 `patches/`，並在本專案結果上驗收。
