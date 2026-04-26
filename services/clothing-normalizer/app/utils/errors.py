"""파이프라인 단계별 실패를 명시적으로 표현하는 예외 계층.

라우트 레이어에서 이 예외를 잡아 적절한 HTTP 상태 코드로 변환한다.
"""
from __future__ import annotations


class NormalizerError(Exception):
    """이 서비스의 모든 도메인 예외의 공통 부모."""

    code: str = "normalizer_error"
    http_status: int = 500


class ImageDecodeError(NormalizerError):
    """업로드된 바이트가 PIL 로 열리지 않거나 손상돼 있음."""

    code = "image_decode_failed"
    http_status = 400


class BackgroundRemovalError(NormalizerError):
    """rembg 호출 자체가 실패."""

    code = "background_removal_failed"
    http_status = 502


class ClothingNotDetectedError(NormalizerError):
    """배경 제거 후 옷 영역을 충분히 신뢰할 수 있게 찾지 못함.

    - alpha > threshold 인 픽셀이 없거나
    - bbox 가 너무 작아서(예: 전체의 0.5% 미만) 잡음일 가능성이 큼.
    """

    code = "clothing_not_detected"
    http_status = 422


class StorageError(NormalizerError):
    """결과 PNG 저장 중 IO/네트워크 문제."""

    code = "storage_failed"
    http_status = 503
