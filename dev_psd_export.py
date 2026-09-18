"""
dev_psd_export.py — 把 see-through PSD 各層導出為「全畫布對齊」的透明 PNG, 供 2.5D viewer 直接堆疊
並驗證疊合 = 原圖。
用法: python dev_psd_export.py <xxx.psd> --out <dir>
"""
import sys
from pathlib import Path
from PIL import Image

def main():
    src = sys.argv[1]
    outdir = Path(sys.argv[sys.argv.index("--out")+1])
    from psd_tools import PSDImage
    psd = PSDImage.open(src)
    W, H = psd.width, psd.height
    outdir.mkdir(parents=True, exist_ok=True)

    # 照 PSD 樹順序 = 畫序(下→上), 存一份 json 順序供 viewer
    order = []
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for layer in psd.descendants():
        if layer.is_group():
            continue
        try:
            im = layer.composite().convert("RGBA")
        except Exception:
            continue
        full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ox, oy = layer.offset
        full.alpha_composite(im, (int(ox), int(oy)))
        safe = "".join(c for c in layer.name if c.isalnum() or c in "-_") or "layer"
        full.save(outdir / f"{safe}.png")
        if layer.visible:
            base.alpha_composite(im, (int(ox), int(oy)))
            order.append({"name": layer.name, "file": f"{safe}.png"})
    base = base.convert("RGB")
    base.save(outdir / "_composite.png")

    import json
    (outdir / "_order.json").write_text(json.dumps(order, ensure_ascii=False, indent=2), encoding="utf-8")
    # 和原始輸入對比 (see-through 輸出 768x768, 原圖 1024x1536 會被 pad)
    print(f"畫序({len(order)}層): {[o['name'] for o in order]}")
    print(f"疊合儲存: {outdir}/_composite.png  ({W}x{H})")
    # 若同一資料夾有原圖, 比對重構誤差
    for cand in [Path(src).with_suffix(".png"), Path(src).parent/"001.png"]:
        if cand.exists():
            orig = Image.open(cand).convert("RGB")
            comp = base.resize(orig.size)
            import numpy as np
            a = np.asarray(orig).astype(int); b = np.asarray(comp).astype(int)
            diff = np.abs(a-b).mean()
            print(f"重構 vs 原圖 {cand.name}: 平均差 {diff:.1f}")
            break

if __name__ == "__main__":
    main()