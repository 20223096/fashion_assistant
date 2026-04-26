"""bytes ↔ PIL ↔ disk 사이 변환을 한곳에 모아 둠.

PIL.Image 객체가 여러 모듈을 흘러다니다 보면 RGBA/RGB 변환이나 EXIF 회전 처리가
중복되기 쉬워서, 입력은 항상 `load_pil_safe` 로, 출력은 항상 `pil_to_png_bytes` 로
지나가도록 강제한다.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import ImageDecodeError


def load_pil_safe(image_bytes: bytes) -> Image.Image:
    """업로드된 바이트를 RGBA PIL 이미지로 변환.

    - EXIF orientation 을 미리 적용해서 세로/가로 사진이 뒤집히지 않게 함.
    - JPEG 등 알파 채널이 없는 이미지는 RGBA 로 강제 변환 (배경 제거 단계에서 알파를 채우기 위함).
    - 손상되거나 지원하지 않는 포맷이면 도메인 예외로 변환.
    """
    if not image_bytes:
        raise ImageDecodeError("empty image bytes")

    try:
        img = Image.open(BytesIO(image_bytes))
        # `Image.open` 은 lazy 라서 실제 디코딩을 강제로 트리거.
        img.load()
    except UnidentifiedImageError as e:
        raise ImageDecodeError("unsupported or corrupt image format") from e
    except Exception as e:  # noqa: BLE001 — PIL 은 다양한 OSError 류 예외를 던짐
        raise ImageDecodeError(f"failed to open image: {e}") from e

    # 핸드폰 사진의 EXIF 회전 메타데이터를 픽셀에 실제로 반영.
    img = ImageOps.exif_transpose(img)

    if img.mode != "RGBA":
        img = img.convert("RGBA")
    return img


def pil_to_png_bytes(image: Image.Image) -> bytes:
    """PIL 이미지를 PNG 바이트로 직렬화.

    배경이 투명한 결과물이 그대로 보존돼야 하므로 항상 PNG 로 인코딩한다.
    """
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    buf = BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
