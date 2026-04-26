"""rembg 를 감싼 얇은 어댑터.

`rembg` 의 세션 객체를 매 요청마다 만들면 모델을 디스크에서 다시 로드해서 매우 느려진다.
프로세스 단위 캐시(`_get_session`)를 두고 같은 모델을 재사용한다.
"""
from __future__ import annotations

from functools import lru_cache
from io import BytesIO

from PIL import Image
from rembg import new_session, remove

from ..config import get_settings
from ..utils.errors import BackgroundRemovalError
from ..utils.image_io import pil_to_png_bytes


@lru_cache(maxsize=4)
def _get_session(model_name: str):
    """모델 세션을 프로세스에 한 번만 만들고 재사용."""
    return new_session(model_name)


def remove_background_image(image: Image.Image) -> Image.Image:
    """RGB(A) PIL 이미지를 받아 배경이 투명해진 RGBA 이미지로 돌려준다.

    rembg 는 bytes 인터페이스가 가장 안정적이라 PIL ↔ bytes 변환을 한 번씩 거친다.
    """
    settings = get_settings()
    try:
        in_bytes = pil_to_png_bytes(image)
        out_bytes = remove(
            in_bytes,
            session=_get_session(settings.rembg_model),
            # alpha matting 은 결과 가장자리를 부드럽게 하지만 매우 느림.
            # 옷 사진은 보통 이미 배경이 단순하므로 기본 끔.
            alpha_matting=False,
        )
        result = Image.open(BytesIO(out_bytes))
        result.load()
        if result.mode != "RGBA":
            result = result.convert("RGBA")
        return result
    except BackgroundRemovalError:
        raise
    except Exception as e:  # noqa: BLE001 — rembg 는 다양한 RuntimeError 를 던짐
        raise BackgroundRemovalError(f"rembg failed: {e}") from e
