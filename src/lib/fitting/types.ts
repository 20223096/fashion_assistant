/** 파츠 종류 — 추후 dress / outer 등 확장 */
export type PartKind = "face" | "top" | "bottom" | "shoes";

/** 트림된 PNG 기준 정규화 좌표 (0~1). bbox crop 아님. */
export type FaceAnchors = {
  neckCenterX: number;
  neckCenterY: number;
};

export type TopAnchors = {
  neckCenterX: number;
  neckCenterY: number;
  waistCenterX: number;
  waistCenterY: number;
};

export type BottomAnchors = {
  waistCenterX: number;
  waistCenterY: number;
  hemCenterX: number;
  hemCenterY: number;
};

export type ShoesAnchors = {
  topCenterX: number;
  topCenterY: number;
};

export type PartAnchors =
  | FaceAnchors
  | TopAnchors
  | BottomAnchors
  | ShoesAnchors;

/** 한 파츠 입력 (RGBA PNG) */
export type PartInput = {
  kind: PartKind;
  buffer: Buffer;
  anchors: PartAnchors;
};

export type CanvasSpec = {
  width: number;
  height: number;
  /** true면 RGBA 배경 완전 투명 */
  transparentBackground: boolean;
};

export type CompositeMvpInput = {
  canvas: CanvasSpec;
  face: PartInput;
  top: PartInput;
  bottom: PartInput;
  shoes: PartInput;
  /** 파츠별 최대 변 길이 (resize inside 상한) */
  maxSide?: Partial<Record<PartKind, number>>;
};

/** 최종 캔버스 좌표계에서의 앵커 점 — 디버그 오버레이용 */
export type DebugAnchorPoint = {
  label: string;
  /** 캔버스 픽셀 */
  x: number;
  y: number;
};

export type LayerPlacementDebug = {
  kind: PartKind;
  left: number;
  top: number;
  width: number;
  height: number;
  points: DebugAnchorPoint[];
};

export type CompositeMvpResult = {
  png: Buffer;
  placements: LayerPlacementDebug[];
};
