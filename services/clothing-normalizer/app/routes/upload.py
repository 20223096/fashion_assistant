"""POST /upload-clothing  — 옷 사진 업로드 → 정규화된 PNG URL 반환.

- 이미지 디코드/배경 제거/옷 검출 단계의 모든 도메인 예외는 적절한 HTTP status code 로 변환된다.
- 무거운 처리(rembg)는 스레드 풀에서 돌려 이벤트 루프를 막지 않는다.
"""
from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..schemas.clothing import (
    ClothingCategory,
    ErrorResponse,
    NormalizationResponse,
)
from ..services.image_processor import normalize_and_store
from ..utils.errors import NormalizerError

router = APIRouter(tags=["clothing"])

ALLOWED_CATEGORIES: set[ClothingCategory] = {"top", "bottom", "shoes"}
MAX_BYTES = 12 * 1024 * 1024  # 12 MB. 모바일 사진 보정 후 보통 5MB 이내.


@router.post(
    "/upload-clothing",
    response_model=NormalizationResponse,
    responses={
        400: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def upload_clothing(
    # FastAPI 0.115+ 권장 시그니처: Annotated 로 의존성 명시.
    file: Annotated[UploadFile, File(description="원본 옷 사진 (jpg/png/webp 등)")],
    category: Annotated[str, Form(description="top | bottom | shoes")],
) -> NormalizationResponse:
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of {sorted(ALLOWED_CATEGORIES)}",
        )
    cat: ClothingCategory = category  # type: ignore[assignment]

    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="empty file")
    if len(image_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="file too large (>12MB)")

    try:
        # rembg / Pillow 는 동기 + CPU 부하가 큼. 이벤트 루프를 막지 않게 별도 스레드로 보냄.
        result = await asyncio.to_thread(normalize_and_store, image_bytes, cat)
    except NormalizerError as e:
        # 도메인 예외 → 적절한 HTTP 코드.
        raise HTTPException(
            status_code=e.http_status,
            detail={"code": e.code, "message": str(e) or e.code},
        ) from e

    return result
