import { ClothingItemCard } from "@/components/closet/ClothingItemCard";
import type { ClothesRow } from "@/types/models";
import { CATEGORY_ORDER } from "@/types/models";

function groupByCategory(items: ClothesRow[]) {
  const map = new Map<string, ClothesRow[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

export function CategoryLibrary({
  clothes,
  density = "default",
}: {
  clothes: ClothesRow[];
  /** 모바일 귀여운 옷장 — 2열·촘촘 */
  density?: "default" | "cozy";
}) {
  const grouped = groupByCategory(clothes);
  const primary = new Set<string>(CATEGORY_ORDER);
  const categories = [
    ...CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !primary.has(c)),
  ];

  if (clothes.length === 0) {
    return (
      <div
        className={
          density === "cozy"
            ? "rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 px-4 py-10 text-center"
            : "rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 px-6 py-16 text-center"
        }
      >
        <p className={density === "cozy" ? "text-sm text-rose-800/80" : "text-stone-600"}>
          아직 옷이 없어요. 아래에서 사진을 올리면 AI가 분류해 줄 거예요.
        </p>
      </div>
    );
  }

  const gridClass =
    density === "cozy"
      ? "grid grid-cols-2 gap-2"
      : "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

  const sectionGap = density === "cozy" ? "space-y-6" : "space-y-10";

  return (
    <div className={sectionGap}>
      {categories.map((cat) => {
        const list = grouped.get(cat) ?? [];
        return (
          <section key={cat}>
            <h2
              className={
                density === "cozy"
                  ? "mb-2 flex items-center gap-2 text-sm font-bold text-rose-950"
                  : "mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900"
              }
            >
              <span
                className={
                  density === "cozy"
                    ? "h-2 w-2 rounded-full bg-rose-400"
                    : "h-2 w-2 rounded-full bg-amber-500"
                }
              />
              {cat}
              <span
                className={
                  density === "cozy"
                    ? "text-xs font-normal text-rose-400"
                    : "text-sm font-normal text-stone-400"
                }
              >
                {list.length}벌
              </span>
            </h2>
            <ul className={gridClass}>
              {list.map((item) => (
                <ClothingItemCard key={item.id} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
