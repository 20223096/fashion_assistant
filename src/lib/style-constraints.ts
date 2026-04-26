/**
 * 사용자 입력 스타일에 대한 강한 제약(프롬프트에 삽입).
 * 올블랙처럼 단일 톤·단일 무드 요청 시 트렌드 다양성 규칙을 덮어씀.
 */
export function describeStrictStyleConstraints(requestedStyle: string): string | null {
  const raw = requestedStyle.trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "").toLowerCase();
  const lower = raw.toLowerCase();

  const isAllBlack =
    compact.includes("올블랙") ||
    raw.includes("올 블랙") ||
    lower.includes("allblack") ||
    lower.includes("all black") ||
    compact === "블랙코디" ||
    (compact.includes("블랙") && compact.includes("올"));

  if (isAllBlack) {
    return `
[최우선 제약 — 사용자가 요청한 스타일: 올블랙(블랙 단일 톤)]
- 제안하는 모든 코디(outfits)는 **올블랙**이어야 한다. 흰색·베이지·컬러 포인트·데님 블루 등 **블랙이 아닌 색이 코디에 보이면 안 된다**.
- piece_ids로 고를 때: 각 아이템의 colors 배열에 **검정·차콜·그래파이트·짙은 회색** 등 어두운 무채색(블랙 톤)만 있는 옷만 사용한다. **흰색·아이보리·베이지·파스텔·원색·밝은 데님**이 colors에 있으면 그 id는 **절대 넣지 않는다**.
- 코디 여러 개(2~4개)를 내더라도 **전부 올블랙**이어야 하며, "다른 스타일(스트릿/빈티지/페미닌 등)"로 분위기를 바꾸지 않는다. 차이는 **실루엣·소재·레이어링**으로만 낸다.
- title·rationale에도 미니멀/스트릿 등 **올블랙과 무관한 스타일 라벨을 끌어오지 않는다**. 문구는 올블랙·톤온톤·무채 다크 톤에 맞춘다.
- purchase_suggestions는 **블랙 또는 짙은 차콜** 아이템만 제안한다. 컬러 악세서리 제안 금지.
- 옷장에 블랙 계열이 부족하면: 가능한 한 블랙 조합만 제안하고, purchase_suggestions에 **블랙 베이스 아이템**을 채운다. 다른 색 옷을 억지로 섞지 않는다.
`.trim();
  }

  return null;
}
