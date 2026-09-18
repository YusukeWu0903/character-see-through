"""
dev_psd_write.py — 由「乾淨的對位層 PNG」寫出乾淨的 PSD

對照 see-through 的 save_psd, 改用原始乾淨層直接建 pixel layer,
不做任何灰底合成/預乘, 避免 PSD 層被灌灰。

用法:
  python dev_psd_write.py --dir <層PNG目錄> --order <order.json> --out <out.psd> --h 1024 --w 1024

- 每一層按 order.json 的順序(底→頂)寫成一個具名的 pixel layer (全畫布座標保留)。
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="含對位層 PNG 的目錄")
    ap.add_argument("--order", required=True, help="_order.json (畫序, 底→頂)")
    ap.add_argument("--out", required=True, help="輸出 .psd 路徑")
    ap.add_argument("--h", type=int, default=1024)
    ap.add_argument("--w", type=int, default=1024)
    args = ap.parse_args()

    d = Path(args.dir)
    order = json.loads(Path(args.order).read_text(encoding="utf-8"))
    # order 可能是 [{"name":"..","file":".."}] 或 [".."]
    entries = order if isinstance(order[0], dict) else [{"name": o, "file": o} for o in order]

    from psd_tools import PSDImage
    # PSDImage takes (width, height).  Keep each full-canvas RGBA image as a
    # pixel layer; do not composite or flatten, which could discard alpha.
    psd = PSDImage.new(mode="RGBA", size=(args.w, args.h), depth=8)
    used = 0
    for e in entries:
        name = e["name"]; f = e.get("file", name)
        p = d / f
        if not p.exists():
            p = d / (f + ".png")
        if not p.exists():
            print("  skip(缺檔案):", name)
            continue
        arr = np.array(Image.open(p).convert("RGBA"))
        if arr.shape[:2] != (args.h, args.w):
            raise ValueError(
                f"{p.name} 是 {arr.shape[1]}x{arr.shape[0]}，預期 {args.w}x{args.h}；"
                "拒絕寫入會破壞畫布對位的 PSD"
            )
        psd.create_pixel_layer(Image.fromarray(arr), name=name, top=0, left=0, opacity=255)
        used += 1
        print(f"  + {name:14s} ({arr.shape[1]}x{arr.shape[0]})")

    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    psd.save(str(out))
    print(f"\n已寫入 {used} 層 → {out}  ({(out).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
