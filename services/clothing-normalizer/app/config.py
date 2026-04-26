"""환경변수에서 읽는 런타임 설정.

설정값을 함수가 아닌 dataclass 로 모아 두면
- 테스트에서 `Settings(canvas_size=512, storage_backend="local")` 같이 임의 값으로 주입하기 쉽고,
- 라우트·서비스 레이어가 환경변수를 직접 읽지 않아도 돼서 의존성이 단순해진다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

# 모듈 import 시점에 .env 를 한 번만 로드. (없으면 무시)
load_dotenv()

StorageBackend = Literal["local", "firebase"]


@dataclass(frozen=True)
class Settings:
    """런타임에 읽기 전용으로 사용하는 설정 묶음."""

    # --- 이미지 처리 ---
    canvas_size: int = 1024
    """표준 정사각 캔버스의 한 변 길이(px)."""

    alpha_threshold: int = 10
    """bbox 계산 시 "옷"으로 간주할 최소 alpha 값(0~255)."""

    rembg_model: str = "isnet-general-use"
    """rembg 모델 이름."""

    # --- 저장소 ---
    storage_backend: StorageBackend = "local"
    """"local" | "firebase"."""

    storage_dir: Path = Path("storage/normalized")
    """로컬 백엔드일 때 결과 PNG 가 저장되는 폴더."""

    original_dir: Path = Path("storage/originals")
    """비교 이미지 생성을 위해 원본도 함께 저장하는 폴더."""

    public_base_url: str = "/files"
    """로컬 백엔드일 때 결과 PNG 를 정적 서빙할 URL prefix."""

    firebase_bucket: str | None = None


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """환경변수에서 한 번 읽어 캐시하는 Settings 헬퍼.

    FastAPI 라우트에서 `Depends(get_settings)` 로 주입해도 되지만
    이 서비스는 단일 프로세스로 동작하므로 그냥 호출해서 쓰는 것도 안전하다.
    """
    backend_raw = os.getenv("NORMALIZER_STORAGE_BACKEND", "local").lower()
    backend: StorageBackend = "firebase" if backend_raw == "firebase" else "local"

    storage_dir = Path(os.getenv("NORMALIZER_STORAGE_DIR", "storage/normalized"))
    original_dir = Path(os.getenv("NORMALIZER_ORIGINAL_DIR", "storage/originals"))
    storage_dir.mkdir(parents=True, exist_ok=True)
    original_dir.mkdir(parents=True, exist_ok=True)

    return Settings(
        canvas_size=_get_int("NORMALIZER_CANVAS_SIZE", 1024),
        alpha_threshold=_get_int("NORMALIZER_ALPHA_THRESHOLD", 10),
        rembg_model=os.getenv("NORMALIZER_REMBG_MODEL", "isnet-general-use"),
        storage_backend=backend,
        storage_dir=storage_dir,
        original_dir=original_dir,
        public_base_url=os.getenv("NORMALIZER_PUBLIC_BASE_URL", "/files"),
        firebase_bucket=os.getenv("FIREBASE_STORAGE_BUCKET") or None,
    )
