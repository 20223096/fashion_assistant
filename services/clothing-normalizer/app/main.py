"""FastAPI 진입점.

라우트 모듈을 모아 등록하고, 로컬 스토리지 백엔드일 때는
결과 PNG 를 정적으로 서빙할 수 있도록 StaticFiles 도 마운트한다.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .routes import compare, upload


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Clothing Normalizer",
        description=(
            "사용자가 업로드한 옷 사진을 배경 제거 → bbox → 표준 캔버스 재배치 "
            "파이프라인으로 자동 보정하는 마이크로서비스."
        ),
        version="0.1.0",
    )

    # 모바일 앱·다른 도메인의 Next.js 에서 호출할 수 있게 CORS 열어 둠.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 로컬 백엔드: 저장된 PNG 를 그대로 정적 서빙해서 URL 로 돌려준다.
    if settings.storage_backend == "local":
        app.mount(
            settings.public_base_url,
            StaticFiles(directory=str(settings.storage_dir)),
            name="files",
        )
        # 비교용 (원본을 같이 서빙)
        app.mount(
            f"{settings.public_base_url}/originals",
            StaticFiles(directory=str(settings.original_dir)),
            name="originals",
        )

    app.include_router(upload.router)
    app.include_router(compare.router)

    @app.get("/healthz", tags=["meta"])
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
