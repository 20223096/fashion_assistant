"""파이프라인 각 단계의 순수 함수와 외부 시스템 어댑터를 모아둔다.

- 단계별 함수는 모두 인자로 PIL.Image / bytes 를 받고 같은 타입을 돌려주는 형태로 통일했다.
- 이렇게 해 두면 `image_processor.normalize_clothing_image` 가 함수 합성처럼 명확히 읽힌다.
"""
