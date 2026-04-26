"""파이프라인을 직접 호출해 before/after 비교 PNG 를 만들어 주는 CLI.

사용 예
    python scripts/compare_before_after.py \
        --image samples/jacket.jpg --category top --out compare.png

서버를 띄우지 않고 파이프라인 동작을 빠르게 확인하고 싶을 때 유용.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 이 스크립트가 services/clothing-normalizer/ 안에서 실행될 수 있도록
# 부모 디렉토리(=프로젝트 루트)를 sys.path 에 추가.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.schemas.clothing import ClothingCategory  # noqa: E402
from app.services.image_processor import (  # noqa: E402
    make_side_by_side,
    normalize_clothing_image,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run clothing normalization pipeline locally and dump a side-by-side PNG."
    )
    parser.add_argument("--image", required=True, type=Path, help="원본 옷 사진 경로")
    parser.add_argument(
        "--category",
        required=True,
        choices=("top", "bottom", "shoes"),
        help="카테고리",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("compare.png"),
        help="비교 결과 PNG 출력 경로",
    )
    parser.add_argument(
        "--canvas",
        type=int,
        default=None,
        help="캔버스 한 변 길이 (기본: 설정값)",
    )
    args = parser.parse_args()

    if not args.image.exists():
        print(f"input not found: {args.image}", file=sys.stderr)
        return 2

    category: ClothingCategory = args.category
    image_bytes = args.image.read_bytes()

    try:
        result = normalize_clothing_image(
            image_bytes,
            category,
            canvas_size=args.canvas,
        )
    except Exception as e:  # noqa: BLE001
        print(f"pipeline failed: {e}", file=sys.stderr)
        return 1

    side = make_side_by_side(result.original_png, result.normalized_png)
    side.save(args.out, format="PNG")

    print(
        f"OK  bbox={result.bbox}  scale={result.placement.scale:.3f}  "
        f"target=({result.placement.target_w}x{result.placement.target_h})  "
        f"-> {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
