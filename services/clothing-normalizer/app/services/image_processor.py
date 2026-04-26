"""사용자 업로드 → 정규화 PNG 까지의 메인 파이프라인.

각 단계는 별도 모듈에 있는 단일 함수로 분리돼 있고, 이 모듈은 그 함수들을
순서대로 호출해 결과를 합치는 *오케스트레이터* 역할만 한다.

흐름
    bytes
      └─ load_pil_safe          (1) 이미지 로드 + EXIF 보정
      └─ remove_background_image(2) 배경 제거 (rembg)
      └─ compute_alpha_bbox     (3) alpha 기반 bbox
      └─ is_bbox_reliable       (3-1) 너무 작은 검출 결과 reject
      └─ compute_placement      (4) 카테고리별 캔버스 배치 계산
      └─ compose_on_canvas      (4) 잘라서 리사이즈 후 합성
      └─ pil_to_png_bytes       (5) PNG 직렬화
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from PIL import Image

from ..config import get_settings
from ..schemas.clothing import (
    BBoxModel,
    ClothingCategory,
    NormalizationResponse,
    PlacementModel,
)
from ..utils.errors import ClothingNotDetectedError
from ..utils.image_io import load_pil_safe, pil_to_png_bytes
from .background_removal import remove_background_image
from .bbox import BBox, compute_alpha_bbox, is_bbox_reliable
from .canvas_layout import Placement, compose_on_canvas, compute_placement
from .storage import Storage, get_storage


@dataclass(frozen=True)
class NormalizationResult:
    """파이프라인이 만들어낸 모든 산출물. 라우트 레이어에서 응답 모델로 변환한다."""

    file_id: str
    original_png: bytes
    normalized_png: bytes
    bbox: BBox
    placement: Placement
    canvas_size: int


def normalize_clothing_image(
    image_bytes: bytes,
    category: ClothingCategory,
    *,
    canvas_size: int | None = None,
    alpha_threshold: int | None = None,
) -> NormalizationResult:
    """업로드 바이트 + 카테고리 → 정규화 PNG 결과.

    파라미터
        image_bytes: 클라이언트가 올린 원본 이미지 바이트.
        category: "top" | "bottom" | "shoes". 카테고리별 배치 규칙을 분기.
        canvas_size: 정사각 캔버스 한 변 길이. 설정값을 덮어쓰고 싶을 때 사용.
        alpha_threshold: bbox 계산 임계값. 설정값을 덮어쓰고 싶을 때 사용.
    """
    settings = get_settings()
    canvas = canvas_size or settings.canvas_size
    threshold = alpha_threshold if alpha_threshold is not None else settings.alpha_threshold

    # (1) 로드 — 손상 / EXIF / 알파 없는 JPEG 같은 케이스를 한곳에서 정규화.
    original = load_pil_safe(image_bytes)

    # (2) 배경 제거.
    rgba = remove_background_image(original)

    # (3) 옷 영역 bbox.
    bbox = compute_alpha_bbox(rgba, threshold=threshold)
    if bbox is None or not is_bbox_reliable(bbox, rgba.size):
        raise ClothingNotDetectedError(
            "could not detect a clothing region from the input image"
        )

    # (4) 카테고리별 배치 계산 + 캔버스 합성.
    placement = compute_placement(bbox, category, (canvas, canvas))
    composed = compose_on_canvas(rgba, placement, (canvas, canvas))

    # (5) PNG 바이트.
    normalized_png = pil_to_png_bytes(composed)
    original_png = pil_to_png_bytes(original)

    return NormalizationResult(
        file_id=uuid.uuid4().hex,
        original_png=original_png,
        normalized_png=normalized_png,
        bbox=bbox,
        placement=placement,
        canvas_size=canvas,
    )


def normalize_and_store(
    image_bytes: bytes,
    category: ClothingCategory,
    *,
    storage: Storage | None = None,
) -> NormalizationResponse:
    """파이프라인 실행 + 결과 저장 + 응답 스키마 빌드까지 한 번에.

    라우트 레이어는 이 함수만 호출하면 되도록 묶어 둔다.
    """
    storage = storage or get_storage()

    result = normalize_clothing_image(image_bytes, category)

    normalized_url = storage.save_normalized(result.file_id, result.normalized_png)
    original_url = storage.save_original(result.file_id, result.original_png)

    bbox = result.bbox
    placement = result.placement
    return NormalizationResponse(
        id=result.file_id,
        category=category,
        canvas_size=result.canvas_size,
        normalized_url=normalized_url,
        original_url=original_url,
        bbox=BBoxModel(x0=bbox[0], y0=bbox[1], x1=bbox[2], y1=bbox[3]),
        placement=PlacementModel(
            scale=round(placement.scale, 4),
            target_w=placement.target_w,
            target_h=placement.target_h,
            paste_x=placement.paste_x,
            paste_y=placement.paste_y,
        ),
    )


def make_side_by_side(
    original_png: bytes,
    normalized_png: bytes,
    *,
    pad: int = 16,
) -> Image.Image:
    """before / after 비교 이미지를 만들어 돌려준다.

    `/compare/{id}` 엔드포인트와 CLI 양쪽에서 재사용한다.
    원본은 캔버스 정사각 크기에 맞춰 균등 축소하고, 결과는 그대로 옆에 붙인다.
    """
    from io import BytesIO

    orig = Image.open(BytesIO(original_png)).convert("RGBA")
    norm = Image.open(BytesIO(normalized_png)).convert("RGBA")

    target_h = norm.height
    # 원본 종횡비 유지하며 normalized 와 같은 높이로 축소.
    scale = target_h / orig.height
    target_w = max(1, int(round(orig.width * scale)))
    orig_resized = orig.resize((target_w, target_h), Image.Resampling.LANCZOS)

    side = Image.new(
        "RGBA",
        (orig_resized.width + norm.width + pad * 3, target_h + pad * 2),
        (250, 250, 250, 255),
    )
    side.paste(orig_resized, (pad, pad), orig_resized)
    side.paste(norm, (orig_resized.width + pad * 2, pad), norm)
    return side
