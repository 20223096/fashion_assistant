"""결과 PNG 를 어디에 저장할지 추상화.

서비스 안에서는 항상 `Storage` 프로토콜만 보고 호출하기 때문에
나중에 S3 / Supabase Storage 로 바꿀 때 이 파일에만 어댑터를 추가하면 된다.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..config import Settings, get_settings
from ..utils.errors import StorageError


class Storage(Protocol):
    """공용 저장소 인터페이스."""

    def save_normalized(self, file_id: str, png_bytes: bytes) -> str: ...
    def save_original(self, file_id: str, png_bytes: bytes) -> str: ...


class LocalFileStorage:
    """`./storage/{normalized,originals}/{id}.png` 에 저장하고
    `/files/{id}.png` 같은 정적 URL 을 돌려준다.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        settings.original_dir.mkdir(parents=True, exist_ok=True)

    def _write(self, dir_: Path, file_id: str, data: bytes) -> Path:
        path = dir_ / f"{file_id}.png"
        try:
            path.write_bytes(data)
        except OSError as e:
            raise StorageError(f"failed to write {path}: {e}") from e
        return path

    def save_normalized(self, file_id: str, png_bytes: bytes) -> str:
        self._write(self._settings.storage_dir, file_id, png_bytes)
        return f"{self._settings.public_base_url}/{file_id}.png"

    def save_original(self, file_id: str, png_bytes: bytes) -> str:
        self._write(self._settings.original_dir, file_id, png_bytes)
        return f"{self._settings.public_base_url}/originals/{file_id}.png"


class FirebaseStorage:
    """Firebase Storage 어댑터. `firebase-admin` 이 설치돼 있고
    `FIREBASE_STORAGE_BUCKET` + `GOOGLE_APPLICATION_CREDENTIALS` 가 설정된 경우에만 쓴다.
    """

    def __init__(self, settings: Settings) -> None:
        if not settings.firebase_bucket:
            raise StorageError("FIREBASE_STORAGE_BUCKET is required for firebase backend")
        try:
            import firebase_admin
            from firebase_admin import credentials, storage  # noqa: F401
        except ImportError as e:  # pragma: no cover
            raise StorageError("firebase-admin is not installed") from e

        # 이미 초기화돼 있으면 재사용.
        if not firebase_admin._apps:  # type: ignore[attr-defined]
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(
                cred, {"storageBucket": settings.firebase_bucket}
            )
        self._bucket = storage.bucket()

    def _upload(self, prefix: str, file_id: str, data: bytes) -> str:
        blob = self._bucket.blob(f"{prefix}/{file_id}.png")
        try:
            blob.upload_from_string(data, content_type="image/png")
            blob.make_public()  # 단순화를 위해 공개. 보안 필요하면 signed URL 로 교체.
        except Exception as e:  # noqa: BLE001
            raise StorageError(f"firebase upload failed: {e}") from e
        return blob.public_url

    def save_normalized(self, file_id: str, png_bytes: bytes) -> str:
        return self._upload("clothing/normalized", file_id, png_bytes)

    def save_original(self, file_id: str, png_bytes: bytes) -> str:
        return self._upload("clothing/originals", file_id, png_bytes)


def get_storage(settings: Settings | None = None) -> Storage:
    """설정값을 보고 적절한 백엔드를 골라 준다."""
    settings = settings or get_settings()
    if settings.storage_backend == "firebase":
        return FirebaseStorage(settings)
    return LocalFileStorage(settings)
