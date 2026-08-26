"use client";

/**
 * 26 Aug 2026, Steven: "i need graphs." A small hand-rolled SVG bar chart
 * rather than pulling in a charting library — 14 daily points is nothing,
 * and it keeps the admin bundle from growing for something this simple.
 */
export default function BarChart({
  data,
  formatValue,
  color = "#5b7cfa",
}: {
  data: { date: string; value: number }[];
  formatValue: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / data.length;

  return (
    <div className="w-full">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-24">
        {data.map((d, i) => {
          const h = (d.value / max) * 36;
          return (
            <rect
              key={d.date}
              x={i * barWidth + barWidth * 0.15}
              y={40 - h}
              width={barWidth * 0.7}
              height={h}
              fill={color}
              rx={0.4}
            >
              <title>
                {d.date}: {formatValue(d.value)}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-textFaint mt-1">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
