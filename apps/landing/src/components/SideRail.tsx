import { useEffect, useState } from "react";

const rail: [string, string][] = [
  ["01", "Hero"],
  ["02", "Jobs"],
  ["03", "Compile"],
  ["04", "Demo"],
  ["05", "Shift"],
  ["06", "Steps"],
  ["07", "Q&A"],
  ["08", "Compare"],
  ["09", "Apply"],
  ["10", "End"],
];

export function SideRail() {
  const [active, setActive] = useState("01");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const n = (e.target as HTMLElement).getAttribute("data-section-num");
            if (n) setActive(n);
          }
        }
      },
      { threshold: 0.35 },
    );
    document
      .querySelectorAll("[data-section-num]")
      .forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <nav className="siderail" aria-label="Section index">
      {rail.map(([n, l]) => (
        <a key={n} href={`#s${n}`} className={active === n ? "is-active" : ""}>
          <span className="sr-tick">§{n}</span>
          <span>{l}</span>
        </a>
      ))}
    </nav>
  );
}
