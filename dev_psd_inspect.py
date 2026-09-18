"""
dev_psd_inspect.py — 解析 see-through 產出的 PSD, 列出圖層結構並導出各層 PNG
用法: python dev_psd_inspect.py <xxx.psd> [--out <dir>]
"""
import sys
from pathlib import Path

def walk(group, depth=0, idx=[0]):
    for layer in group:
        pad = "  " * depth
        if layer.is_group():
            print(f"{pad}[G] {layer.name}")
            walk(layer, depth + 1, idx)
        else:
            try:
                w, h = layer.offset[0] and (0,0)
            except Exception:
                w = h = 0
            try:
                size = (layer.info.width, layer.info.height)
            except Exception:
                size = (0, 0)
            vis = "v" if layer.visible else "x"
            print(f"{pad}  - [{vis}] {layer.name}  bbox={layer.offset} size={size}")
            idx[0] += 1

def main():
    src = sys.argv[1]
    if "--out" in sys.argv:
        outdir = Path(sys.argv[sys.argv.index("--out")+1])
    else:
        outdir = Path(src).parent / "psd_layers"
    from psd_tools import PSDImage
    psd = PSDImage.open(src)
    print(f"=== PSD: {src} | {psd.width}x{psd.height} | mode={psd.color_mode} ===")
    print("=== 圖層樹 ===")
    walk(psd)

    # 導出所有 visible layer 組合成全圖 + 每層個別 PNG
    outdir.mkdir(parents=True, exist_ok=True)
    top = psd.composite()
    top.save(outdir / "00_composite.png")

    def flatten(group):
        # 回傳 dict: name -> composite image (只該層 visible 內容, 同尺寸)
        import numpy as np
        from PIL import Image
        from psd_tools.constants import BlendMode
        result = {}
        # 先由背景墊透明, 逐層把可見層疊上
        base = Image.new("RGBA", (psd.width, psd.height), (0,0,0,0))
        for layer in group:
            if layer.is_group():
                result.update(flatten(layer))
                continue
            if layer.visible:
                im = layer.composite().convert("RGBA")
                off = layer.offset
                base.alpha_composite(im, off)
        result["_flat"] = base
        return result

    print("\n=== 導出每層 PNG ===")
    try:
        from PIL import Image
        for layer in psd.descendants():
            try:
                im = layer.composite().convert("RGBA")
            except Exception:
                continue
            # 裁到內容 bbox
            alpha = im.getchannel("A")
            try:
                bbox = alpha.getbbox()
            except Exception:
                bbox = None
            if bbox:
                im = im.crop(bbox)
            safe = "".join(c for c in layer.name if c.isalnum() or c in "-_") or "layer"
            im.save(outdir / f"{safe}.png")
            print(f"  ✓ {safe}.png  {im.size}")
    except Exception as e:
        print("  導出失敗:", e)

if __name__ == "__main__":
    main()