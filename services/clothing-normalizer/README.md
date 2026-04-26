# Clothing Normalizer

사용자가 아무렇게나 찍은 옷 사진을 받아
**배경 제거 → 옷 영역 bbox → 카테고리별 표준 캔버스(1024×1024) 재배치**
를 자동으로 수행해 일관된 투명 PNG 로 돌려주는 FastAPI 마이크로서비스.

이 서비스는 메인 Next.js 앱(`fashion_assistant`)에서 별도 프로세스로 띄워 사용하는
**사이드카** 구조를 가정합니다. 메인 앱은 `POST /upload-clothing` 한 번만 호출하면 되고,
이 안에서 일어나는 모델 로딩·이미지 처리는 모두 이 서비스 안에서 격리됩니다.

---

## 폴더 구조와 각 파일 역할

```
services/clothing-normalizer/
├── README.md                       이 문서
├── requirements.txt                정확한 버전 고정된 의존성 (rembg, Pillow, FastAPI 등)
├── .env.example                    NORMALIZER_* / FIREBASE_* 환경변수 샘플
├── app/
│   ├── main.py                     FastAPI 앱 빌더 + StaticFiles 마운트 + /healthz
│   ├── config.py                   환경변수를 읽어 dataclass(Settings) 로 노출
│   ├── routes/
│   │   ├── upload.py               POST /upload-clothing — 업로드 엔드포인트
│   │   └── compare.py              GET  /compare/{id}    — before/after PNG
│   ├── services/
│   │   ├── image_processor.py      (1)~(5) 전체 파이프라인 오케스트레이터
│   │   ├── background_removal.py   rembg 세션 캐시 + PIL <-> bytes 어댑터
│   │   ├── bbox.py                 alpha 채널 → bbox + 신뢰도 검증
│   │   ├── canvas_layout.py        카테고리별 배치 규칙(dataclass) + compose_on_canvas
│   │   └── storage.py              Local / Firebase 두 백엔드 + Storage Protocol
│   ├── schemas/
│   │   └── clothing.py             Pydantic 입출력 (요청은 multipart, 응답은 NormalizationResponse)
│   └── utils/
│       ├── errors.py               NormalizerError 계층 (HTTP 상태 매핑)
│       └── image_io.py             load_pil_safe / pil_to_png_bytes
├── scripts/
│   └── compare_before_after.py     서버 없이 파이프라인 실행 → 비교 PNG 만들기
└── tests/
    └── test_pipeline.py            bbox / placement / compose / 실패 경로 단위 테스트
```

---

## 처리 파이프라인

```
업로드 bytes
   │
   ▼ load_pil_safe         (1) 이미지 로드 + EXIF 회전 보정 + RGBA 강제
   ▼ remove_background_image (2) rembg 로 배경 → 알파
   ▼ compute_alpha_bbox    (3) alpha > threshold 픽셀의 최소 박스
   ▼ is_bbox_reliable      (3-1) 너무 작거나 잡음이면 ClothingNotDetectedError
   ▼ compute_placement     (4) 카테고리별 height/anchor/margin 으로 배치 계산
   ▼ compose_on_canvas     (4) 잘라서 리사이즈 후 1024×1024 투명 캔버스에 paste
   ▼ pil_to_png_bytes      (5) PNG 직렬화
저장 후 URL 반환
```

### 카테고리별 배치 규칙

| category | height | width 상한 | anchor | 여백 |
|---------|--------|-----------|--------|------|
| top     | 75% canvas height | 92% canvas width | top    | top 6% |
| bottom  | 78% canvas height | 85% canvas width | bottom | bottom 4% |
| shoes   | max(가로,세로) = 55% canvas height | (동일) | center | 정중앙 |

값은 `app/services/canvas_layout.py` 의 `CATEGORY_RULES` 딕셔너리에 모여 있으니
규칙 변경 시 이 한 곳만 수정하면 됩니다.

---

## 실패 케이스 처리

| 상황 | 예외 | HTTP |
|------|------|------|
| 이미지 디코드 실패(손상/지원 안 됨) | `ImageDecodeError` | 400 |
| 12MB 초과 | (라우트에서 직접) | 413 |
| `category` 가 `top/bottom/shoes` 아님 | (라우트에서 직접) | 400 |
| rembg 호출 자체 실패 | `BackgroundRemovalError` | 502 |
| 옷 영역을 못 찾음 / 너무 작음 | `ClothingNotDetectedError` | 422 |
| 결과 저장(IO/네트워크) 실패 | `StorageError` | 503 |

라우트(`upload.py`) 가 `NormalizerError` 를 잡아 `e.http_status` 와 `e.code` 를 그대로 매핑.

---

## 실행

```bash
cd services/clothing-normalizer

# 1) 가상환경 + 의존성 설치 (rembg 가 ONNX 모델을 처음 로딩 시 ~50MB 다운로드함)
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2) 환경변수 (선택)
cp .env.example .env

# 3) 개발 서버
uvicorn app.main:app --reload --port 8000

# 4) 동작 확인
curl -X POST http://localhost:8000/upload-clothing \
  -F "file=@./samples/jacket.jpg" \
  -F "category=top"
```

응답 예:

```json
{
  "id": "f7ab92d7c3...",
  "category": "top",
  "canvas_size": 1024,
  "normalized_url": "/files/f7ab92d7c3...png",
  "original_url": "/files/originals/f7ab92d7c3...png",
  "bbox": { "x0": 120, "y0": 70, "x1": 880, "y1": 1180 },
  "placement": {
    "scale": 0.692,
    "target_w": 526,
    "target_h": 768,
    "paste_x": 249,
    "paste_y": 61
  }
}
```

before/after 비교는 같은 `id` 로:

```
GET http://localhost:8000/compare/f7ab92d7c3...
```

또는 서버 없이 CLI 로:

```bash
python scripts/compare_before_after.py \
  --image samples/jacket.jpg --category top --out compare.png
```

---

## 단위 테스트

```bash
pytest -q
```

`tests/test_pipeline.py` 는 rembg 를 호출하지 않는 *순수 계산* 부분(bbox / placement /
compose / 실패 경로)만 검증합니다. 실 ML 통합은 별도 e2e 테스트로 분리하는 것을 권장.

---

## 메인 앱(Next.js) 에서 호출 예시

```ts
// 클라이언트 측 (브라우저에서 직접 호출하지 말고 Next.js Route Handler 를 거치는 걸 권장)
const fd = new FormData();
fd.append("file", file);
fd.append("category", "top");

const res = await fetch(`${process.env.NORMALIZER_URL}/upload-clothing`, {
  method: "POST",
  body: fd,
});
const data = await res.json(); // { normalized_url, bbox, placement, ... }
```

기존 Next.js 의 `src/app/api/clothes/analyze/route.ts` 안에서
배경 제거·bbox·정규화 처리를 **모두 이 서비스로 위임**하면, Vision 분석은 그대로 두고
이미지 정규화 책임만 깨끗이 분리할 수 있습니다.
