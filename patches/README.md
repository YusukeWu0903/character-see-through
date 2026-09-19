# 上游 see-through 修正紀錄

`see-through-alpha-export.patch` 是套用到外部 see-through checkout 的
`common/utils/inference_utils.py` 的最小修正。

它在上游 PNG 寫入前，將「接近畫布邊界中性色、且與邊界連通」的像素 Alpha 設為 0，避免 LayerDiff 的不透明灰／白灰板進入最終檔案；角色內部不與邊界連通的灰色內容會保留。

新成品與驗證資料均在本專案的 `outputs\seethrough_local\<task>` 下；不再依賴上游輸出資料夾做交付。
