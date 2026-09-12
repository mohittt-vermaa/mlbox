import { el, getJSON } from "./lib.js";

export async function initGpuTab(root) {
  const data = await getJSON("data/recipes.json");
  const list = el("div", { class: "grid" });
  let filter = "all";

  const chips = el("div", { class: "chips", style: "margin-bottom:16px" });
  const filters = [["all", "everything"], ...data.tiers.map((t) => [t.id, t.name])];
  for (const [id, label] of filters) {
    chips.append(el("button", {
      class: "chip", type: "button", "aria-pressed": id === filter ? "true" : "false",
      onclick: (e) => {
        filter = id;
        chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
        render();
      },
    }, label));
  }

  root.append(
    el("h2", { class: "section", style: "margin-top:0" }, "What you can actually train without a GPU"),
    el("p", { class: "section-sub" }, data.note),
    el("div", { class: "grid cols-2" },
      ...data.tiers.map((t) => el("div", { class: "card" },
        el("div", { style: "display:flex;gap:8px;align-items:center;margin-bottom:6px" },
          el("span", { class: `pill ${t.id}` }, t.name)),
        el("div", { class: "code muted", style: "margin-bottom:8px" }, t.spec),
        el("p", { class: "small", style: "margin:0 0 8px" }, el("b", {}, "Good for: "), t.fits),
        el("p", { class: "small muted", style: "margin:0" }, el("b", {}, "Watch out: "), t.watch)
      ))
    ),
    el("h2", { class: "section" }, "Recipes"),
    el("p", { class: "section-sub" }, "Each one is a complete project you can finish in a sitting, ordered roughly from easiest to hardest."),
    chips, list
  );

  function render() {
    list.textContent = "";
    const rows = data.recipes.filter((r) => filter === "all" || r.hardware === filter);
    for (const r of rows) {
      const tier = data.tiers.find((t) => t.id === r.hardware);
      list.append(el("div", { class: "recipe" },
        el("div", { class: "meta" },
          el("span", { class: `pill ${r.hardware}` }, tier ? tier.name : r.hardware),
          el("span", {}, "⏱ " + r.time),
          el("span", {}, "· difficulty: " + r.difficulty)
        ),
        el("h3", {}, r.title),
        el("p", { class: "tagline" }, r.tagline),
        el("p", { class: "small", style: "margin:0" }, el("b", {}, "Why this works here: "), r.why),
        r.code ? el("pre", {}, r.code) : null,
        el("p", { class: "small", style: "margin:8px 0 0" }, el("b", {}, "You'll learn: "),
          r.learn.map((l, i) => el("span", {}, i ? ", " : "", l))),
        el("div", { class: "gotcha" }, el("b", {}, "Gotcha: "), r.gotcha),
        r.links.length ? el("p", { class: "small", style: "margin:10px 0 0" },
          r.links.map((l, i) => el("span", {}, i ? " · " : "", el("a", { href: l.url, target: "_blank", rel: "noopener" }, l.label)))) : null
      ));
    }
  }
  render();
}
