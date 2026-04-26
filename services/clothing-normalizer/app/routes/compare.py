"""GET /compare/{id}  — 보정 전 vs 후 비교 이미지를 PNG 로 돌려준다.

이미 저장된 원본·정규화 PNG 를 다시 읽어 side-by-side 이미지를 만든다.
이 엔드포인트는 디버깅·QA 용이라 인증 없이 동작.
"""
from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..config import get_settings
from ..services.image_processor import make_side_by_side

router = APIRouter(tags=["clothing"])


@router.get("/compare/{file_id}")
def compare(file_id: str) -> StreamingResponse:
    settings = get_settings()
    if settings.storage_backend != "local":
        # Firebase 백엔드일 때는 별도 다운로드 로직이 필요해 일단 막아둠.
        raise HTTPException(
            status_code=501,
            detail="compare endpoint is only available with local storage",
        )

    original_path = settings.original_dir / f"{file_id}.png"
    normalized_path = settings.storage_dir / f"{file_id}.png"

    if not original_path.exists() or not normalized_path.exists():
        raise HTTPException(status_code=404, detail="file not found")

    side = make_side_by_side(
        original_png=original_path.read_bytes(),
        normalized_png=normalized_path.read_bytes(),
    )

    buf = BytesIO()
    side.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
