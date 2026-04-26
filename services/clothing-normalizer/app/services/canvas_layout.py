"""카테고리별 캔버스 배치 규칙과 합성 함수.

규칙은 dataclass 로 분리해 두면
- 추후 카테고리 추가(예: 원피스, 아우터)가 쉬워지고
- 테스트에서 "이 카테고리는 이 비율을 지키는가" 단위로 검증할 수 있다.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from PIL import Image

from ..schemas.clothing import ClothingCategory
from ..utils.errors import NormalizerError
from .bbox import BBox

Anchor = Literal["top", "bottom", "center"]


@dataclass(frozen=True)
class CategoryRules:
    """카테고리별 표준 캔버스 배치 규칙.

    - height_ratio: 옷의 높이를 캔버스 높이의 몇 % 로 맞출지.
    - max_width_ratio: 너무 옆으로 퍼진 옷일 때 가로 폭 상한 (이걸 넘으면 가로 기준으로 다시 스케일).
    - anchor: 위/아래/가운데 중 어느 변에 정렬할지.
    - top_margin_ratio / bottom_margin_ratio: anchor 와 반대편 여백 비율.
    """

    height_ratio: float
    max_width_ratio: float
    anchor: Anchor
    top_margin_ratio: float = 0.0
    bottom_margin_ratio: float = 0.0


# 요구 사양 (top: 75%/위6%/아래15~20%, bottom: 78%/아래여백 강조, shoes: 55% 중앙)
# 을 그대로 옮긴 값. 숫자만 보면 되도록 한 곳에 모아 둠.
CATEGORY_RULES: dict[ClothingCategory, CategoryRules] = {
    "top": CategoryRules(
        height_ratio=0.75,
        max_width_ratio=0.92,
        anchor="top",
        top_margin_ratio=0.06,
        bottom_margin_ratio=0.19,  # 참고용 (anchor=top 일 때는 사용 안 함)
    ),
    "bottom": CategoryRules(
        height_ratio=0.78,
        max_width_ratio=0.85,
        anchor="bottom",
        bottom_margin_ratio=0.04,  # 아래 여백 강조 → 4% 만 남기고 바닥에 붙임
    ),
    "shoes": CategoryRules(
        # 신발은 height 가 아니라 max(가로/세로)=55% 로 다루는 게 자연스럽다.
        # 아래 compute_placement 에서 카테고리 분기로 따로 처리한다.
        height_ratio=0.55,
        max_width_ratio=0.55,
        anchor="center",
    ),
}


@dataclass(frozen=True)
class Placement:
    """원본 bbox 를 캔버스 어디에 어떤 크기로 올릴지의 결과."""

    scale: float
    target_w: int
    target_h: int
    paste_x: int
    paste_y: int
    crop_box: BBox  # 원본에서 잘라낼 영역(bbox 그대로)


class InvalidBBoxError(NormalizerError):
    code = "invalid_bbox"
    http_status = 422


def compute_placement(
    bbox: BBox,
    category: ClothingCategory,
    canvas_size: tuple[int, int],
) -> Placement:
    """bbox + 카테고리 + 캔버스 크기 → 최종 배치 정보.

    이 함수는 PIL 객체를 만지지 않는다. 순수 계산만 해서 테스트가 쉽다.
    """
    canvas_w, canvas_h = canvas_size
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0

    if bw <= 0 or bh <= 0:
        raise InvalidBBoxError("bbox has zero area")

    rules = CATEGORY_RULES[category]

    if category == "shoes":
        # 신발은 가로·세로 중 더 긴 변이 캔버스의 55% 가 되도록 균등 스케일.
        target_long = canvas_h * rules.height_ratio
        scale = target_long / max(bw, bh)
        target_w = max(1, int(round(bw * scale)))
        target_h = max(1, int(round(bh * scale)))
        paste_x = (canvas_w - target_w) // 2
        paste_y = (canvas_h - target_h) // 2
        return Placement(scale, target_w, target_h, paste_x, paste_y, bbox)

    # top / bottom 공통 로직: 일단 height 기준으로 맞추고, width 가 넘치면 width 기준으로 다시 맞춤.
    target_h = canvas_h * rules.height_ratio
    scale = target_h / bh
    target_w = bw * scale
    if target_w > canvas_w * rules.max_width_ratio:
        scale = (canvas_w * rules.max_width_ratio) / bw
        target_w = bw * scale
        target_h = bh * scale

    target_w_i = max(1, int(round(target_w)))
    target_h_i = max(1, int(round(target_h)))

    if rules.anchor == "top":
        paste_y = int(round(canvas_h * rules.top_margin_ratio))
    elif rules.anchor == "bottom":
        paste_y = canvas_h - target_h_i - int(round(canvas_h * rules.bottom_margin_ratio))
    else:  # center (top/bottom 카테고리에서는 사용 안 함이지만 안전상 분기 유지)
        paste_y = (canvas_h - target_h_i) // 2

    paste_x = (canvas_w - target_w_i) // 2

    return Placement(
        scale=scale,
        target_w=target_w_i,
        target_h=target_h_i,
        paste_x=paste_x,
        paste_y=paste_y,
        crop_box=bbox,
    )


def compose_on_canvas(
    rgba: Image.Image,
    placement: Placement,
    canvas_size: tuple[int, int],
) -> Image.Image:
    """배치 정보대로 옷 영역을 잘라 리사이즈하고 투명 캔버스에 붙인다."""
    if rgba.mode != "RGBA":
        rgba = rgba.convert("RGBA")

    cropped = rgba.crop(placement.crop_box)
    resized = cropped.resize(
        (placement.target_w, placement.target_h),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    # 알파 채널을 마스크로 사용해 부드럽게 합성.
    canvas.paste(resized, (placement.paste_x, placement.paste_y), resized)
    return canvas
