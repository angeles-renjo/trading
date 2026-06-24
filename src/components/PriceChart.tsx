"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandlesResponse } from "@/lib/api/types";

// Candlestick chart with S/R zones and the current plan (entry/stop/target)
// drawn as horizontal price lines. Loaded client-only (see dynamic import in
// the page) since lightweight-charts needs the DOM.
export default function PriceChart({
  interval = "240",
  height = 380,
}: {
  interval?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart: IChartApi = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#11161c" },
        textColor: "#8a93a3",
      },
      grid: {
        vertLines: { color: "#1a212b" },
        horzLines: { color: "#1a212b" },
      },
      rightPriceScale: { borderColor: "#222c38" },
      timeScale: { borderColor: "#222c38", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });

    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#16c784",
      downColor: "#ea3943",
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
      borderVisible: false,
    });

    let priceLines: IPriceLine[] = [];
    let cancelled = false;

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);

    const load = async () => {
      try {
        const res = await fetch(`/api/candles?interval=${interval}&limit=300`, {
          cache: "no-store",
        });
        const data = (await res.json()) as CandlesResponse;
        if (cancelled || !data.candles) return;

        series.setData(
          data.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );

        for (const l of priceLines) series.removePriceLine(l);
        priceLines = [];

        for (const z of data.zones) {
          priceLines.push(
            series.createPriceLine({
              price: z.center,
              color: z.kind === "support" ? "#16c78466" : "#ea394366",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `${z.kind === "support" ? "S" : "R"} ${z.strength}`,
            }),
          );
        }
        if (data.plan) {
          const lines: Array<[number, string, string]> = [
            [data.plan.entry, "#3b82f6", "entry"],
            [data.plan.stop, "#ea3943", "stop"],
            [data.plan.target, "#16c784", "target"],
          ];
          for (const [price, color, title] of lines) {
            priceLines.push(
              series.createPriceLine({ price, color, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title }),
            );
          }
        }
        chart.timeScale().fitContent();
      } catch {
        // leave the chart empty on error; the dashboard shows the message
      }
    };

    load();
    const id = setInterval(load, 20_000);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [interval, height]);

  return <div ref={ref} className="w-full" />;
}
