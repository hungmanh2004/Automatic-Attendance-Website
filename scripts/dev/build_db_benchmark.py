# Step 1: Scan SCface + LFW and create inventory CSV/JSON
# Note: dùng importlib để giữ style import linh hoạt.

import importlib

argparse = importlib.import_module("argparse")
csv = importlib.import_module("csv")
json = importlib.import_module("json")
re = importlib.import_module("re")
Path = importlib.import_module("pathlib").Path


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def is_image(p):
    return p.is_file() and p.suffix.lower() in IMAGE_EXTS


def scan_lfw(lfw_root):
    """
    LFW chuẩn: mỗi thư mục con là 1 người.
    """
    result = {}
    for person_dir in sorted(lfw_root.iterdir()):
        if not person_dir.is_dir():
            continue
        images = [p for p in sorted(person_dir.iterdir()) if is_image(p)]
        if images:
            identity = f"lfw:{person_dir.name}"
            result[identity] = images
    return result


def guess_scface_identity(path_obj):
    """
    Heuristic đơn giản: tìm cụm số 3-4 chữ số trong tên file hoặc path.
    """
    text = "/".join(path_obj.parts) + "/" + path_obj.stem
    m = re.search(r"\b(\d{3,4})\b", text)
    if not m:
        return None
    return f"scface:{m.group(1)}"


def scan_scface(scface_root):
    result = {}
    for p in sorted(scface_root.rglob("*")):
        if not is_image(p):
            continue
        identity = guess_scface_identity(p)
        if identity is None:
            continue
        result.setdefault(identity, []).append(p)
    return result


def summarize(grouped):
    counts = [len(v) for v in grouped.values()]
    if not counts:
        return {
            "identities": 0,
            "images_total": 0,
            "min_images_per_identity": 0,
            "max_images_per_identity": 0,
            "avg_images_per_identity": 0.0,
        }
    return {
        "identities": len(grouped),
        "images_total": sum(counts),
        "min_images_per_identity": min(counts),
        "max_images_per_identity": max(counts),
        "avg_images_per_identity": round(sum(counts) / len(counts), 2),
    }


def write_inventory_csv(out_csv, lfw_data, scface_data):
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["source", "identity", "image_count", "sample_image"],
        )
        writer.writeheader()

        for identity, imgs in sorted(scface_data.items()):
            writer.writerow(
                {
                    "source": "scface",
                    "identity": identity,
                    "image_count": len(imgs),
                    "sample_image": str(imgs[0]),
                }
            )

        for identity, imgs in sorted(lfw_data.items()):
            writer.writerow(
                {
                    "source": "lfw",
                    "identity": identity,
                    "image_count": len(imgs),
                    "sample_image": str(imgs[0]),
                }
            )


def main():
    parser = argparse.ArgumentParser("step1_scan_datasets")
    parser.add_argument("--scface-root", required=True, help="Path to SCface folder")
    parser.add_argument("--lfw-root", required=True, help="Path to LFW folder")
    parser.add_argument("--out-dir", default="benchmark_data/step1_inventory")
    args = parser.parse_args()

    scface_root = Path(args.scface_root)
    lfw_root = Path(args.lfw_root)
    out_dir = Path(args.out_dir)

    if not scface_root.exists():
        raise FileNotFoundError(f"SCface path not found: {scface_root}")
    if not lfw_root.exists():
        raise FileNotFoundError(f"LFW path not found: {lfw_root}")

    scface_data = scan_scface(scface_root)
    lfw_data = scan_lfw(lfw_root)

    scface_summary = summarize(scface_data)
    lfw_summary = summarize(lfw_data)

    summary = {
        "scface": scface_summary,
        "lfw": lfw_summary,
        "total_identities": scface_summary["identities"] + lfw_summary["identities"],
        "total_images": scface_summary["images_total"] + lfw_summary["images_total"],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_inventory_csv(out_dir / "inventory.csv", lfw_data, scface_data)
    (out_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"Inventory CSV: {out_dir / 'inventory.csv'}")
    print(f"Summary JSON: {out_dir / 'summary.json'}")


if __name__ == "__main__":
    main()