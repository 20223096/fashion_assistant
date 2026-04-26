"""Clothing pipeline 의 입출력 스키마.

* `ClothingCategory` 는 카테고리별 배치 규칙(top/bottom/shoes)을 분기하는 키로도 쓰인다.
* `NormalizationResponse` 는 클라이언트(예: Next.js 앱)가 곧바로 사용할 수 있도록
  결과 URL 과 디버깅에 도움이 되는 메타데이터(원본 bbox, 적용된 scale 등)를 함께 돌려준다.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ClothingCategory = Literal["top", "bottom", "shoes"]


class BBoxModel(BaseModel):
    """원본 이미지에서 검출된 옷 영역(픽셀 좌표)."""

    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def width(self) -> int:
        return self.x1 - self.x0

    @property
    def height(self) -> int:
        return self.y1 - self.y0


class PlacementModel(BaseModel):
    """캔버스 위에 옷을 어떻게 올렸는지 요약."""

    scale: float = Field(..., description="원본 bbox 에 적용된 확대/축소 배율")
    target_w: int
    target_h: int
    paste_x: int
    paste_y: int


class NormalizationResponse(BaseModel):
    """`POST /upload-clothing` 응답."""

    id: str
    category: ClothingCategory
    canvas_size: int

    normalized_url: str
    original_url: str

    bbox: BBoxModel
    placement: PlacementModel


class ErrorResponse(BaseModel):
    code: str
    message: str
