import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "motion/react";
import { useAnalyticsMotion } from "../motion/AnalyticsMotionProvider.jsx";

export function AnimatedNumber({ value, formatter = (number) => String(Math.round(number)), duration = 0.55, ...props }) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const { level } = useAnalyticsMotion();
  const previousRef = useRef(safe);
  const [displayValue, setDisplayValue] = useState(safe);

  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = safe;
    if (level !== "full" || from === safe) {
      setDisplayValue(safe);
      return undefined;
    }
    const controls = animate(from, safe, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setDisplayValue,
    });
    return () => controls.stop();
  }, [duration, level, safe]);

  return <span {...props}>{formatter(displayValue)}</span>;
}

export function OdometerNumber({ value, formatter = (number) => String(Math.round(number)), className, style }) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const { level } = useAnalyticsMotion();
  const text = String(formatter(safe));
  if (level !== "full") return <span className={className} style={style}>{text}</span>;

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "baseline", ...style }} aria-label={text}>
      {text.split("").map((character, index) => {
        const numeric = /\d/.test(character);
        return (
          <span key={`slot-${index}`} style={{ display: "inline-grid", overflow: "hidden", height: "1.05em", minWidth: numeric ? ".58em" : "auto", placeItems: "center" }} aria-hidden="true">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={`${index}-${character}`}
                initial={{ y: index % 2 ? "62%" : "-62%", opacity: .2, filter: "blur(2px)" }}
                animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                exit={{ y: index % 2 ? "-62%" : "62%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: .32, delay: Math.max(0, (text.length - index - 1) * .018), ease: [0.22, 1, 0.36, 1] }}
                style={{ gridArea: "1/1", display: "block", lineHeight: 1 }}
              >
                {character}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}
