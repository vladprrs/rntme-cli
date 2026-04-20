import { useEffect, useState } from "react";

const rail: [string, string][] = [
  ["01", "Hero"],
  ["02", "Problem"],
  ["03", "Compare"],
  ["04", "Blueprint"],
  ["05", "Steps"],
  ["06", "Best fit"],
  ["07", "Anti fit"],
  ["08", "Pilot"],
  ["09", "FAQ"],
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
