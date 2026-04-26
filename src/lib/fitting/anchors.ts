import type {
  BottomAnchors,
  FaceAnchors,
  PartAnchors,
  PartKind,
  ShoesAnchors,
  TopAnchors,
} from "./types";

/**
 * 최종 캔버스(픽셀)에서의 고정 앵커 — 템플릿 MVP.
 * TODO: pose estimation / SAM 으로 동일 필드를 실측 덮어쓰기.
 */
export type CanvasAnchorTemplate = {
  /** 얼굴·머리 하단 목 중심 */
  faceNeck: { x: number; y: number };
  /** 상의 넥라인 중심 (`faceNeck`과 같으면 목·넥라인 동일 행에 붙음) */
  topNeckline: { x: number; y: number };
  /** 상의 밑단 허리 중심 */
  topWaistline: { x: number; y: number };
  /** 하의 허리밴드 중심 (top waist 와 시각적으로 이어지게 근접 배치) */
  bottomWaistline: { x: number; y: number };
  /** 하의 밑단(hem) 중심 — 신발 위쪽 정렬 참고용 */
  bottomHemline: { x: number; y: number };
  /** 신발 상단 중심이 맞을 캔버스 위치 */
  shoesTop: { x: number; y: number };
};

export function defaultCanvasAnchors(
  width: number,
  height: number
): CanvasAnchorTemplate {
  const cx = width * 0.5;
  const topNeckY = Math.round(height * 0.152);
  return {
    /** 목 타깃 = 상의 넥라인 Y(동일) → 얼굴 레이어만 아래로 붙음, 상의 Y는 그대로 */
    faceNeck: { x: cx, y: topNeckY },
    topNeckline: { x: cx, y: topNeckY },
    topWaistline: { x: cx, y: height * 0.425 },
    /** 상의 밑단과 하의 허리를 더 가깝게 */
    bottomWaistline: { x: cx, y: height * 0.432 },
    bottomHemline: { x: cx, y: height * 0.775 },
    shoesTop: { x: cx, y: height * 0.815 },
  };
}

/** 샘플·기본값: 각 PNG(트림 후)에서 앵커 비율 */
export const DEFAULT_FACE_ANCHORS: FaceAnchors = {
  neckCenterX: 0.5,
  /** 타이트 헤드샷(목이 프레임 하단) — 넥라인과 붙이려면 하단에 가깝게 */
  neckCenterY: 0.93,
};

export const DEFAULT_TOP_ANCHORS: TopAnchors = {
  neckCenterX: 0.5,
  neckCenterY: 0.12,
  waistCenterX: 0.5,
  waistCenterY: 0.88,
};

export const DEFAULT_BOTTOM_ANCHORS: BottomAnchors = {
  waistCenterX: 0.5,
  waistCenterY: 0.08,
  hemCenterX: 0.5,
  hemCenterY: 0.9,
};

export const DEFAULT_SHOES_ANCHORS: ShoesAnchors = {
  topCenterX: 0.5,
  topCenterY: 0.35,
};

export function defaultAnchorsForPart(kind: PartKind): PartAnchors {
  switch (kind) {
    case "face":
      return { ...DEFAULT_FACE_ANCHORS };
    case "top":
      return { ...DEFAULT_TOP_ANCHORS };
    case "bottom":
      return { ...DEFAULT_BOTTOM_ANCHORS };
    case "shoes":
      return { ...DEFAULT_SHOES_ANCHORS };
  }
}
