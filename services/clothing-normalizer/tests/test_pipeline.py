"""파이프라인의 *순수 계산 부분*에 대한 단위 테스트.

rembg 자체는 외부 ML 모델을 다운로드/실행해야 해서 단위 테스트 단계에서는 스킵.
대신 알파 채널을 직접 칠해서 합성 이미지를 만들어 bbox / placement / compose 를 검증한다.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from app.services.bbox import compute_alpha_bbox, is_bbox_reliable
from app.services.canvas_layout import (
    CATEGORY_RULES,
    compose_on_canvas,
    compute_placement,
)
from app.services.image_processor import make_side_by_side
from app.utils.errors import ClothingNotDetectedError


def _make_alpha_image(size: tuple[int, int], box: tuple[int, int, int, int]) -> Image.Image:
    """투명 캔버스 위에 box 영역만 불투명한 빨간색으로 칠한 RGBA 이미지를 만든다."""
    w, h = size
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    x0, y0, x1, y1 = box
    arr[y0:y1, x0:x1] = (220, 60, 60, 255)
    return Image.fromarray(arr, mode="RGBA")


def test_compute_alpha_bbox_finds_painted_region() -> None:
    img = _make_alpha_image((400, 400), (50, 80, 200, 300))

    bbox = compute_alpha_bbox(img, threshold=10)
    assert bbox == (50, 80, 200, 300)


def test_compute_alpha_bbox_returns_none_for_fully_transparent() -> None:
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    assert compute_alpha_bbox(img) is None


def test_is_bbox_reliable_filters_tiny_noise() -> None:
    # 1x1 점은 신뢰 불가
    assert is_bbox_reliable((10, 10, 11, 11), (400, 400)) is False
    # 충분히 큰 영역
    assert is_bbox_reliable((10, 10, 200, 300), (400, 400)) is True


def test_placement_top_anchors_to_top_with_margin() -> None:
    canvas = 1024
    bbox = (100, 50, 500, 850)  # h=800, w=400
    p = compute_placement(bbox, "top", (canvas, canvas))

    # height_ratio=0.75 → target_h ~= 768. 다만 width 가 384 < 0.92*1024 라 그대로.
    expected_target_h = round(canvas * CATEGORY_RULES["top"].height_ratio)
    assert abs(p.target_h - expected_target_h) <= 1
    # 위 여백 6%
    assert p.paste_y == round(canvas * CATEGORY_RULES["top"].top_margin_ratio)
    # 가로 중앙 정렬
    assert p.paste_x == (canvas - p.target_w) // 2


def test_placement_bottom_anchors_to_bottom() -> None:
    canvas = 1024
    bbox = (0, 0, 500, 800)
    p = compute_placement(bbox, "bottom", (canvas, canvas))

    bottom_margin = round(canvas * CATEGORY_RULES["bottom"].bottom_margin_ratio)
    # 옷의 하단이 바닥에서 (bottom_margin) 만큼 위에 있어야 함.
    assert p.paste_y + p.target_h == canvas - bottom_margin


def test_placement_shoes_centered_with_55_percent_long_side() -> None:
    canvas = 1024
    bbox = (0, 0, 600, 300)  # 가로가 더 김
    p = compute_placement(bbox, "shoes", (canvas, canvas))

    expected_long = canvas * 0.55
    assert abs(max(p.target_w, p.target_h) - expected_long) <= 1
    # 정중앙 정렬
    assert abs(p.paste_x - (canvas - p.target_w) // 2) <= 1
    assert abs(p.paste_y - (canvas - p.target_h) // 2) <= 1


def test_compose_pastes_resized_garment_within_canvas() -> None:
    canvas = 512
    src = _make_alpha_image((400, 400), (50, 80, 350, 380))
    bbox = compute_alpha_bbox(src)
    assert bbox is not None
    p = compute_placement(bbox, "top", (canvas, canvas))
    out = compose_on_canvas(src, p, (canvas, canvas))

    assert out.size == (canvas, canvas)
    # 결과의 실제 그려진 영역이 placement 와 거의 일치해야 함.
    out_bbox = compute_alpha_bbox(out)
    assert out_bbox is not None
    ox0, oy0, ox1, oy1 = out_bbox
    assert abs((ox1 - ox0) - p.target_w) <= 2
    assert abs((oy1 - oy0) - p.target_h) <= 2


def test_make_side_by_side_returns_combined_image() -> None:
    canvas = 256
    src = _make_alpha_image((400, 400), (50, 80, 350, 380))
    bbox = compute_alpha_bbox(src)
    assert bbox is not None
    p = compute_placement(bbox, "shoes", (canvas, canvas))
    normalized = compose_on_canvas(src, p, (canvas, canvas))

    from app.utils.image_io import pil_to_png_bytes

    side = make_side_by_side(pil_to_png_bytes(src), pil_to_png_bytes(normalized))
    # 정규화 이미지의 높이 + 패딩 정도가 그대로 유지돼야 함.
    assert side.height >= normalized.height
    assert side.width > normalized.width


def test_normalize_pipeline_raises_when_clothing_missing(monkeypatch) -> None:
    """배경 제거 단계가 완전히 투명한 이미지를 돌려줄 때 ClothingNotDetectedError 가 나야 한다."""
    from app.services import image_processor

    blank = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    monkeypatch.setattr(
        image_processor,
        "remove_background_image",
        lambda _img: blank,
    )

    import pytest

    fake_jpeg = _make_alpha_image((100, 100), (10, 10, 90, 90))
    from app.utils.image_io import pil_to_png_bytes

    with pytest.raises(ClothingNotDetectedError):
        image_processor.normalize_clothing_image(pil_to_png_bytes(fake_jpeg), "top")
