export type {
  BottomAnchors,
  CanvasSpec,
  CompositeMvpInput,
  CompositeMvpResult,
  DebugAnchorPoint,
  FaceAnchors,
  LayerPlacementDebug,
  PartAnchors,
  PartInput,
  PartKind,
  ShoesAnchors,
  TopAnchors,
} from "./types";
export {
  defaultAnchorsForPart,
  defaultCanvasAnchors,
  type CanvasAnchorTemplate,
} from "./anchors";
export {
  canvasFromSpec,
  composeFittingMvp,
  composeFittingMvpWithPlacements,
} from "./composite";
export type { AlphaShapeMetrics } from "./alpha-shape";
export {
  measureAlphaShapeFromBuffer,
  trimForAlphaMeasure,
} from "./alpha-shape";
export {
  estimateAllAnchorsFromBuffers,
  estimateAnchorsForPart,
  estimateAnchorsFromAlphaShape,
  estimateBottomAnchorsFromAlphaShape,
  estimateFaceAnchorsFromAlphaShape,
  estimateShoesAnchorsFromAlphaShape,
  estimateTopAnchorsFromAlphaShape,
  type EstimatedAnchorsBundle,
} from "./estimate-anchors";
