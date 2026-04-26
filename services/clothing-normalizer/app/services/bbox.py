"""alpha 채널에서 옷 영역 bbox 를 계산한다.

PIL 의 `Image.getbbox` 도 비슷한 일을 하지만 임계값을 지원하지 않아서
배경 제거 결과의 살짝 남은 가장자리 노이즈까지 bbox 에 포함된다.
여기서는 임계값 기반으로 numpy 마스크를 만들어 더 안정적으로 자른다.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

# (x0, y0, x1, y1) — x1/y1 은 exclusive (PIL crop 규약과 동일)
BBox = tuple[int, int, int, int]


def compute_alpha_bbox(image: Image.Image, threshold: int = 10) -> BBox | None:
    """`alpha > threshold` 인 픽셀들을 감싸는 최소 bbox 를 반환.

    조건에 맞는 픽셀이 하나도 없으면 `None`. 호출 측에서 "옷 검출 실패"로 처리한다.
    """
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    mask = alpha > threshold

    if not mask.any():
        return None

    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    y_idx = np.where(rows)[0]
    x_idx = np.where(cols)[0]

    y0, y1 = int(y_idx[0]), int(y_idx[-1])
    x0, x1 = int(x_idx[0]), int(x_idx[-1])

    # x1/y1 은 exclusive 로 변환 (PIL crop 호환)
    return x0, y0, x1 + 1, y1 + 1


def is_bbox_reliable(
    bbox: BBox,
    image_size: tuple[int, int],
    *,
    min_area_ratio: float = 0.005,
    min_side_px: int = 32,
) -> bool:
    """검출된 bbox 가 "실제 옷"으로 보일 만큼 충분히 큰지 확인.

    배경 제거 모델이 카메라 뒤 작은 점이나 그림자를 잘못 잡았을 때를 걸러내기 위함.
    """
    img_w, img_h = image_size
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0

    if bw < min_side_px or bh < min_side_px:
        return False
    area_ratio = (bw * bh) / float(img_w * img_h)
    return area_ratio >= min_area_ratio
