# 第一階段驗證紀錄

日期：2026-09-19。分支：`codex/hierarchical-rig-v1`。
素材：`Eris_full_body_casual_20260918_113905`；未重新推論或修改 PNG／PSD。

## 已通過

- `node --test tests/test_rig.mjs`：7 項通過，涵蓋靜止還原、父子變換、
  臉部和腿鞋同步、髮根錨點、控制上限及無效設定。
- `python -m pytest tests/test_seethrough_alpha.py -q`：7 項通過。
- 真實 Chromium：15 張雲端／17 張本機 PNG 均 HTTP 200；無 JavaScript 執行錯誤；
  Canvas 確實繪圖；姿勢、重設、暫停與原版頁面檢查通過。
- 實際測試發現 Windows `.mjs` MIME 為 text/plain，已明確註冊 text/javascript 並重測通過。
- `git diff --exit-code milestone/clean-layers-v1 -- preview_viewer.html run_seethrough_local.py dev_psd_write.py`
  無差異。

## 畫面及限制

已產生預設、中性、正負極限與舊動作對照截圖，位於 `outputs/rig_validation/`。
目視檢查極限姿勢：角色完整可見、控制面板不遮蔽脚掌；仍有既有本機素材嘴部／線條差異。
截圖不證明連續動作完全自然；使用者的實際拖動驗收仍待完成。
這是完整父繼承的剛性側傾原型，尚未提供頸部網格過渡、轉頭補繪、腳底鎖定或物理。
呼吸是整體起伏，會移動腳掌。錨點為 Eris 手動設定，不代表其他角色可直接使用。

瀏覽器驗證腳本：`node tests/check_rig_browser.cjs`，需要 Playwright 及 Chromium。
可用 `NODE_PATH` 指向既有 Playwright，`RIG_TEST_CHROMIUM` 指定已安裝的 Chromium。
`RIG_TEST_BASE` 預設 http://127.0.0.1:8011，`RIG_TEST_TASK` 可覆寫素材任務。
腳本輸出截圖與 browser-report.json 到專案 outputs，無角色素材被提交 Git。

## 使用入口

- 原版仍在 http://127.0.0.1:8010/preview?local=Eris_full_body_casual_20260918_113905
- 實驗服務在 http://127.0.0.1:8011/preview-rig?local=Eris_full_body_casual_20260918_113905
- 服務終止後可依規格中的 uvicorn 指令重啟；入口不是永久託管服務。

第一階段程式可供比較，尚未合併 main 或標記為已接受的品質里程碑。

## 預設看似靜止修正

使用者回報新版不動：首版 body/head 預設為零且無自動驅動，呼吸低於正常顯示的一個像素；
滑鼠只驅動舊動作。補上預設開啟的待機擺動與滑鼠跟隨，僅驅動父節點，既有角度上限不變。
可分別關閉；回原位關閉兩者；恢復預設重新啟用。暫停凍結時間與平滑後的滑鼠值。
新增驗證正常大小頭部兩秒位移超過 2 像素、五官一致、輸入疊加不突破上限，
以及瀏覽器預設畫面確實變動、暫停畫面不變、滑鼠帶動新版畫面。
