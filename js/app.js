import { createStore } from "./store.js";
import { POKEDEX } from "./pokedex.js";
import { calcUrl } from "./nitoyon.js";

/* ================= 定数 ================= */
const GOAL_STATUS = [
  { k: "unsecured", label: "未確保" },
  { k: "hunting", label: "厳選中" },
  { k: "secured", label: "個体確保" },
  { k: "training", label: "育成中" },
  { k: "done", label: "育成完了" },
];
const MON_STATUS = [
  { k: "hunting", label: "厳選中" },
  { k: "main", label: "本命" },
  { k: "hold", label: "保留" },
  { k: "released", label: "手放した" },
];
const STRAT_STATUS = [
  { k: "active", label: "進行中" },
  { k: "paused", label: "保留" },
  { k: "done", label: "完了" },
];
const FIELDS = ["ワカクサ本島", "シアンの砂浜", "トープ洞窟", "ウノハナ雪原", "ラピスラズリ湖畔", "ゴールド旧発電所"];
const ROLES = ["きのみ", "食材", "スキル", "サポート"];
const SUB_LV = [10, 25, 50, 75, 100];

const PK_BY_EN = new Map(POKEDEX.pokemon.map((p) => [p.en, p]));
const PK_BY_JA = new Map(POKEDEX.pokemon.map((p) => [p.ja, p]));
const SUB_BY_EN = new Map(POKEDEX.subskills.map((s) => [s.en, s]));
const NAT_BY_EN = new Map(POKEDEX.natures.map((n) => [n.en, n]));

/* ================= 状態 ================= */
let store;
let DB = { strategies: {}, goals: {}, mons: {} };
let pendingRender = false;
const app = document.getElementById("app");

/* ================= ユーティリティ ================= */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const label = (list, k) => (list.find((x) => x.k === k) || list[0]).label;
const statusIdx = (k) => Math.max(GOAL_STATUS.findIndex((x) => x.k === k), 0);
const rows = (col) =>
  Object.entries(DB[col] || {})
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
const pkName = (en) => (PK_BY_EN.get(en) || {}).ja || en || "（未選択）";
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString("ja-JP") : "");

function md(text) {
  if (!text) return '<p class="muted">（本文なし）</p>';
  if (window.marked && window.DOMPurify) {
    return window.DOMPurify.sanitize(window.marked.parse(text, { breaks: true }));
  }
  return `<div class="pre">${esc(text)}</div>`;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
}

function goalProgress(goals) {
  const n = goals.length;
  const counts = GOAL_STATUS.map((s) => goals.filter((g) => (g.status || "unsecured") === s.k).length);
  const pct = n ? Math.round((goals.reduce((p, g) => p + statusIdx(g.status), 0) / (4 * n)) * 100) : 0;
  return { n, counts, pct, done: counts[4] };
}

function progressBar(goals) {
  const { n, counts, pct, done } = goalProgress(goals);
  if (!n) return '<div class="muted small">目標がまだありません</div>';
  const segs = counts
    .map((c, i) => (c ? `<span class="seg s${i}" style="flex:${c}" title="${GOAL_STATUS[i].label} ${c}"></span>` : ""))
    .join("");
  return `<div class="pbar">${segs}</div>
    <div class="small muted">進行度 ${pct}% ・ 育成完了 ${done}/${n}</div>`;
}

const goalBadge = (k) => `<span class="badge s${statusIdx(k)}">${esc(label(GOAL_STATUS, k))}</span>`;
const monBadge = (k) => `<span class="badge m-${esc(k || "hunting")}">${esc(label(MON_STATUS, k))}</span>`;

function natureText(en) {
  const n = NAT_BY_EN.get(en);
  if (!n) return "";
  return n.up ? `${n.ja}（${n.up}↑ ${n.down}↓）` : `${n.ja}（無補正）`;
}

function ingText(mon) {
  const p = PK_BY_EN.get(mon.pokemon);
  if (!p || !p.ing.length) return "";
  const t = mon.ingType || "AAA";
  const pick = (ch) => p.ing["ABC".indexOf(ch)] || p.ing[0];
  return [pick(t[0]), pick(t[1]), pick(t[2])].map((x) => x.n).join(" / ");
}

/* ================= カード部品 ================= */
function monCard(m, { showGoal = true } = {}) {
  const p = PK_BY_EN.get(m.pokemon);
  const subs = (m.subskills || [])
    .map((en, i) => {
      if (!en) return "";
      const s = SUB_BY_EN.get(en);
      const locked = m.level && Number(m.level) < SUB_LV[i] ? " locked" : "";
      return `<span class="chip ${s ? s.color : ""}${locked}">${esc(s ? s.ja : en)}</span>`;
    })
    .join("");
  const goal = m.goalId && DB.goals[m.goalId];
  return `<a class="card" href="#/mon/${m.id}">
    <div class="row wrap gap">
      <b>${esc(pkName(m.pokemon))}</b>
      ${m.nickname ? `<span class="muted">「${esc(m.nickname)}」</span>` : ""}
      <span class="badge plain">Lv${esc(m.level || "?")}</span>
      ${monBadge(m.status)}
    </div>
    <div class="small muted">${esc(natureText(m.nature))}${p ? ` ・ ${esc(p.skill)} Lv${esc(m.skillLv || 1)}` : ""}</div>
    ${subs ? `<div class="chips">${subs}</div>` : ""}
    ${ingText(m) ? `<div class="small">食材: ${esc(ingText(m))}</div>` : ""}
    ${m.memo ? `<div class="memo">${esc(m.memo)}</div>` : ""}
    ${showGoal && goal ? `<div class="small muted">🎯 ${esc(goal.title)}</div>` : ""}
  </a>`;
}

function goalCard(g) {
  const mons = rows("mons").filter((m) => m.goalId === g.id && m.status !== "released");
  const main = mons.find((m) => m.status === "main");
  const strat = g.strategyId && DB.strategies[g.strategyId];
  return `<a class="card" href="#/goal/${g.id}">
    <div class="row between"><b>${esc(g.title || "（無題）")}</b>${goalBadge(g.status)}</div>
    <div class="small muted">${[g.field, g.role, g.pokemon ? pkName(g.pokemon) : ""].filter(Boolean).map(esc).join(" ・ ")}</div>
    ${main ? `<div class="small">本命: ${esc(pkName(main.pokemon))} Lv${esc(main.level || "?")}</div>` : mons.length ? `<div class="small">候補 ${mons.length}体</div>` : ""}
    ${g.doneCriteria ? `<div class="small muted">完了基準: ${esc(g.doneCriteria)}</div>` : ""}
    ${strat ? `<div class="small muted">📘 ${esc(strat.title)}</div>` : ""}
  </a>`;
}

/* ================= 画面 ================= */
function viewHome() {
  const strats = rows("strategies").filter((s) => (s.status || "active") === "active");
  const goals = rows("goals");
  const hunting = rows("mons").filter((m) => (m.status || "hunting") === "hunting");
  const { counts } = goalProgress(goals);
  const openGoals = goals.filter((g) => g.status !== "done").sort((a, b) => statusIdx(a.status) - statusIdx(b.status));

  return `
  <h1>ホーム</h1>
  <section>
    <h2>役割の確保状況</h2>
    <div class="statgrid">
      ${GOAL_STATUS.map((s, i) => `<a class="stat s${i}" href="#/goals?status=${s.k}"><b>${counts[i]}</b><span>${s.label}</span></a>`).join("")}
    </div>
  </section>
  <section>
    <div class="row between"><h2>進行中の方針</h2><a class="btn sm" href="#/strategy-edit/new">＋ 方針</a></div>
    ${strats.length ? strats.map((s) => {
      const sg = goals.filter((g) => g.strategyId === s.id);
      return `<a class="card" href="#/strategy/${s.id}">
        <b>${esc(s.title || "（無題）")}</b>
        ${s.approach ? `<div class="approach">▶ ${esc(s.approach)}</div>` : ""}
        ${progressBar(sg)}
      </a>`;
    }).join("") : '<div class="empty">まだ方針がありません。「＋ 方針」から作成しましょう。</div>'}
  </section>
  <section>
    <h2>厳選中の個体</h2>
    ${hunting.length ? hunting.map((m) => monCard(m)).join("") : '<div class="empty">厳選中の個体はありません</div>'}
  </section>
  <section>
    <div class="row between"><h2>未完了の目標</h2><a class="btn sm" href="#/goal-edit/new">＋ 目標</a></div>
    ${openGoals.length ? openGoals.map(goalCard).join("") : '<div class="empty">未完了の目標はありません</div>'}
  </section>`;
}

function viewStrategies() {
  const list = rows("strategies");
  const goals = rows("goals");
  const groups = STRAT_STATUS.map((st) => ({ st, items: list.filter((s) => (s.status || "active") === st.k) }));
  return `
  <div class="row between"><h1>方針</h1><a class="btn" href="#/strategy-edit/new">＋ 新しい方針</a></div>
  ${groups.map(({ st, items }) => items.length ? `
    <h2>${st.label}（${items.length}）</h2>
    ${items.map((s) => `<a class="card" href="#/strategy/${s.id}">
      <b>${esc(s.title || "（無題）")}</b>
      ${s.approach ? `<div class="approach">▶ ${esc(s.approach)}</div>` : ""}
      ${progressBar(goals.filter((g) => g.strategyId === s.id))}
    </a>`).join("")}` : "").join("") || '<div class="empty">まだ方針がありません</div>'}`;
}

function viewStrategy(id) {
  const s = DB.strategies[id];
  if (!s) return notFound();
  const goals = rows("goals").filter((g) => g.strategyId === id).sort((a, b) => statusIdx(a.status) - statusIdx(b.status));
  return `
  <a class="back" href="#/strategies">← 方針一覧</a>
  <div class="row between"><h1>${esc(s.title || "（無題）")}</h1><span class="badge plain">${esc(label(STRAT_STATUS, s.status))}</span></div>
  <form class="quick" data-quick="approach" data-id="${id}">
    <label>現在のアプローチ</label>
    <div class="row gap"><input name="approach" value="${esc(s.approach)}" placeholder="例：バンギの食材型を厳選中"><button class="btn">更新</button></div>
  </form>
  <section>${progressBar(goals)}</section>
  <section class="mdbody">${md(s.body)}</section>
  <section>
    <div class="row between"><h2>目標（${goals.length}）</h2><a class="btn sm" href="#/goal-edit/new?strategy=${id}">＋ 目標</a></div>
    ${goals.map(goalCard).join("") || '<div class="empty">この方針の目標はまだありません</div>'}
  </section>
  <div class="actions"><a class="btn" href="#/strategy-edit/${id}">方針を編集</a></div>
  <div class="small muted">更新: ${fmtDate(s.updatedAt)}</div>`;
}

function viewStrategyEdit(id) {
  const isNew = id === "new";
  const s = isNew ? { status: "active" } : DB.strategies[id];
  if (!s) return notFound();
  return `
  <a class="back" href="${isNew ? "#/strategies" : `#/strategy/${id}`}">← 戻る</a>
  <h1>${isNew ? "新しい方針" : "方針を編集"}</h1>
  <form class="form" data-form="strategy" data-id="${id}">
    <label>タイトル<input name="title" required value="${esc(s.title)}" placeholder="例：ワカクサ本島でカレー週を回す"></label>
    <label>状態<select name="status">${STRAT_STATUS.map((x) => `<option value="${x.k}" ${x.k === (s.status || "active") ? "selected" : ""}>${x.label}</option>`).join("")}</select></label>
    <label>現在のアプローチ<input name="approach" value="${esc(s.approach)}" placeholder="今どんなやり方で進めているか（一行）"></label>
    <label>本文（Markdown が使えます）<textarea name="body" rows="14" placeholder="# 方針&#10;- 狙い&#10;- 理由&#10;- やらないこと">${esc(s.body)}</textarea></label>
    <label>並び順（小さいほど上）<input name="order" type="number" value="${esc(s.order ?? 0)}"></label>
    <div class="actions">
      <button class="btn primary">保存</button>
      ${isNew ? "" : `<button type="button" class="btn danger" data-del="strategies" data-id="${id}">削除</button>`}
    </div>
  </form>`;
}

function viewGoals(q) {
  const filter = q.get("status") || "open";
  const strat = q.get("strategy") || "";
  let list = rows("goals");
  if (strat) list = list.filter((g) => g.strategyId === strat);
  const shown = GOAL_STATUS.filter((s) => (filter === "open" ? s.k !== "done" : filter === "all" ? true : s.k === filter));
  const chip = (k, text) => `<a class="fchip ${filter === k ? "on" : ""}" href="#/goals?status=${k}${strat ? `&strategy=${strat}` : ""}">${text}</a>`;
  return `
  <div class="row between"><h1>目標（役割の枠）</h1><a class="btn" href="#/goal-edit/new">＋ 新しい目標</a></div>
  <div class="fchips">${chip("open", "未完了")}${chip("all", "すべて")}${GOAL_STATUS.map((s) => chip(s.k, s.label)).join("")}</div>
  <select class="filter" data-nav="strategy">
    <option value="">すべての方針</option>
    ${rows("strategies").map((s) => `<option value="${s.id}" ${s.id === strat ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
  </select>
  ${shown.map((st) => {
    const items = list.filter((g) => (g.status || "unsecured") === st.k);
    return items.length ? `<h2>${goalBadge(st.k)} ${items.length}</h2>${items.map(goalCard).join("")}` : "";
  }).join("") || '<div class="empty">該当する目標はありません</div>'}`;
}

function viewGoal(id) {
  const g = DB.goals[id];
  if (!g) return notFound();
  const mons = rows("mons").filter((m) => m.goalId === id);
  const strat = g.strategyId && DB.strategies[g.strategyId];
  return `
  <a class="back" href="#/goals">← 目標一覧</a>
  <h1>${esc(g.title || "（無題）")}</h1>
  <div class="small muted">${[g.field, g.role, g.pokemon ? pkName(g.pokemon) : ""].filter(Boolean).map(esc).join(" ・ ")}</div>
  ${strat ? `<div class="small">📘 <a href="#/strategy/${g.strategyId}">${esc(strat.title)}</a></div>` : ""}
  <section>
    <label class="small muted">状態（タップで変更）</label>
    <div class="steps">
      ${GOAL_STATUS.map((s, i) => `<button class="step s${i} ${statusIdx(g.status) >= i ? "on" : ""} ${statusIdx(g.status) === i ? "cur" : ""}" data-goal-status="${s.k}" data-id="${id}">${s.label}</button>`).join("")}
    </div>
  </section>
  <section class="kv">
    <div><span>欲しい条件</span><div class="pre">${esc(g.conditions) || '<span class="muted">未設定</span>'}</div></div>
    <div><span>完了基準</span><div class="pre">${esc(g.doneCriteria) || '<span class="muted">未設定</span>'}</div></div>
    ${g.memo ? `<div><span>メモ</span><div class="pre">${esc(g.memo)}</div></div>` : ""}
  </section>
  <section>
    <div class="row between"><h2>割り当てた個体（${mons.length}）</h2><a class="btn sm" href="#/mon-edit/new?goal=${id}">＋ 個体を登録</a></div>
    ${mons.map((m) => monCard(m, { showGoal: false })).join("") || '<div class="empty">まだ個体がありません</div>'}
  </section>
  <div class="actions"><a class="btn" href="#/goal-edit/${id}">目標を編集</a></div>`;
}

function viewGoalEdit(id, q) {
  const isNew = id === "new";
  const g = isNew ? { status: "unsecured", strategyId: q.get("strategy") || "" } : DB.goals[id];
  if (!g) return notFound();
  return `
  <a class="back" href="${isNew ? "#/goals" : `#/goal/${id}`}">← 戻る</a>
  <h1>${isNew ? "新しい目標" : "目標を編集"}</h1>
  <form class="form" data-form="goal" data-id="${id}">
    <label>目標名<input name="title" required value="${esc(g.title)}" placeholder="例：ジンジャー用バンギ"></label>
    <label>方針<select name="strategyId"><option value="">（なし）</option>
      ${rows("strategies").map((s) => `<option value="${s.id}" ${s.id === g.strategyId ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
    </select></label>
    <label>状態<select name="status">${GOAL_STATUS.map((x) => `<option value="${x.k}" ${x.k === (g.status || "unsecured") ? "selected" : ""}>${x.label}</option>`).join("")}</select></label>
    <label>対象ポケモン（任意）<input name="pokemonJa" list="pokedex" value="${esc(g.pokemon ? pkName(g.pokemon) : "")}" placeholder="名前を入力して候補から選択"></label>
    <div class="grid2">
      <label>フィールド<input name="field" list="fields" value="${esc(g.field)}"></label>
      <label>役割<input name="role" list="roles" value="${esc(g.role)}"></label>
    </div>
    <label>欲しい条件<textarea name="conditions" rows="3" placeholder="例：食材ABB、おてスピM、性格は食材↑">${esc(g.conditions)}</textarea></label>
    <label>完了基準<textarea name="doneCriteria" rows="2" placeholder="例：Lv50到達・スキルLv5">${esc(g.doneCriteria)}</textarea></label>
    <label>メモ<textarea name="memo" rows="3">${esc(g.memo)}</textarea></label>
    <label>並び順（小さいほど上）<input name="order" type="number" value="${esc(g.order ?? 0)}"></label>
    <div class="actions">
      <button class="btn primary">保存</button>
      ${isNew ? "" : `<button type="button" class="btn danger" data-del="goals" data-id="${id}">削除</button>`}
    </div>
  </form>`;
}

function viewMons(q) {
  const filter = q.get("status") || "active";
  const word = q.get("q") || "";
  let list = rows("mons");
  if (filter === "active") list = list.filter((m) => m.status !== "released");
  else if (filter !== "all") list = list.filter((m) => (m.status || "hunting") === filter);
  if (word) list = list.filter((m) => `${pkName(m.pokemon)} ${m.nickname || ""} ${m.memo || ""}`.includes(word));
  const chip = (k, text) => `<a class="fchip ${filter === k ? "on" : ""}" href="#/mons?status=${k}">${text}</a>`;
  return `
  <div class="row between"><h1>個体</h1><a class="btn" href="#/mon-edit/new">＋ 個体を登録</a></div>
  <div class="fchips">${chip("active", "手持ち")}${chip("all", "すべて")}${MON_STATUS.map((s) => chip(s.k, s.label)).join("")}</div>
  <input class="filter" data-nav="q" value="${esc(word)}" placeholder="名前・ニックネーム・メモで検索">
  ${list.map((m) => monCard(m)).join("") || '<div class="empty">該当する個体はありません</div>'}`;
}

function viewMon(id) {
  const m = DB.mons[id];
  if (!m) return notFound();
  const p = PK_BY_EN.get(m.pokemon);
  const goal = m.goalId && DB.goals[m.goalId];
  return `
  <a class="back" href="#/mons">← 個体一覧</a>
  <div class="row wrap gap"><h1>${esc(pkName(m.pokemon))}</h1>${monBadge(m.status)}</div>
  ${m.nickname ? `<div class="muted">「${esc(m.nickname)}」</div>` : ""}
  ${p ? `<div class="small muted">${esc(p.type)} ・ ${esc(p.sp)}タイプ ・ ${esc(p.skill)}</div>` : ""}
  <section class="kv">
    <div><span>レベル</span><div>Lv${esc(m.level || "?")}</div></div>
    <div><span>性格</span><div>${esc(natureText(m.nature)) || "未設定"}</div></div>
    <div><span>メインスキル</span><div>${p ? esc(p.skill) : ""} Lv${esc(m.skillLv || 1)}</div></div>
    <div><span>食材</span><div>${esc(ingText(m)) || "未設定"}</div></div>
    <div><span>サブスキル</span><div class="chips">${SUB_LV.map((lv, i) => {
      const s = SUB_BY_EN.get((m.subskills || [])[i]);
      const locked = m.level && Number(m.level) < lv ? " locked" : "";
      return `<span class="chip ${s ? s.color : ""}${locked}"><small>Lv${lv}</small> ${s ? esc(s.ja) : "—"}</span>`;
    }).join("")}</div></div>
    <div><span>目標</span><div>${goal ? `<a href="#/goal/${m.goalId}">${esc(goal.title)}</a>` : "なし"}</div></div>
    ${m.obtainedAt ? `<div><span>入手日</span><div>${esc(m.obtainedAt)}</div></div>` : ""}
  </section>
  ${m.memo ? `<section><h2>メモ</h2><div class="memo big">${esc(m.memo)}</div></section>` : ""}
  <div class="actions">
    <a class="btn" href="#/mon-edit/${id}">編集</a>
    ${p ? `<a class="btn primary" href="${esc(calcUrl(m))}" target="_blank" rel="noopener">にとよん計算機で開く ↗</a>` : ""}
  </div>`;
}

function viewMonEdit(id, q) {
  const isNew = id === "new";
  const m = isNew
    ? { status: "hunting", level: 10, skillLv: 1, ingType: "AAA", goalId: q.get("goal") || "", subskills: [], obtainedAt: new Date().toISOString().slice(0, 10) }
    : DB.mons[id];
  if (!m) return notFound();
  const goal = m.goalId && DB.goals[m.goalId];
  const defaultPk = !m.pokemon && goal && goal.pokemon ? goal.pokemon : m.pokemon;
  return `
  <a class="back" href="${isNew ? "#/mons" : `#/mon/${id}`}">← 戻る</a>
  <h1>${isNew ? "個体を登録" : "個体を編集"}</h1>
  <form class="form" data-form="mon" data-id="${id}">
    <label>ポケモン<input name="pokemonJa" list="pokedex" required value="${esc(defaultPk ? pkName(defaultPk) : "")}" placeholder="名前を入力して候補から選択" autocomplete="off"></label>
    <div class="small muted" data-pkinfo></div>
    <div class="grid2">
      <label>レベル<input name="level" type="number" min="1" max="100" inputmode="numeric" value="${esc(m.level)}"></label>
      <label>スキルLv<select name="skillLv">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === Number(m.skillLv || 1) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    </div>
    <label>性格<select name="nature"><option value="">（未設定）</option>
      ${POKEDEX.natures.map((n) => `<option value="${n.en}" ${n.en === m.nature ? "selected" : ""}>${esc(n.up ? `${n.ja}（${n.up}↑ ${n.down}↓）` : `${n.ja}（無補正）`)}</option>`).join("")}
    </select></label>
    <fieldset><legend>食材（Lv1 / Lv30 / Lv60）</legend><div data-ings></div></fieldset>
    <fieldset><legend>サブスキル</legend>
      ${SUB_LV.map((lv, i) => `<label class="inline">Lv${lv}<select name="sub${i}"><option value="">（未設定）</option>
        ${POKEDEX.subskills.map((s) => `<option value="${s.en}" ${s.en === (m.subskills || [])[i] ? "selected" : ""}>${esc(s.ja)}</option>`).join("")}
      </select></label>`).join("")}
    </fieldset>
    <label>状態<select name="status">${MON_STATUS.map((x) => `<option value="${x.k}" ${x.k === (m.status || "hunting") ? "selected" : ""}>${x.label}</option>`).join("")}</select></label>
    <label>目標<select name="goalId"><option value="">（なし）</option>
      ${rows("goals").map((g) => `<option value="${g.id}" ${g.id === m.goalId ? "selected" : ""}>${esc(g.title)}</option>`).join("")}
    </select></label>
    <label>ニックネーム<input name="nickname" value="${esc(m.nickname)}"></label>
    <label>入手日<input name="obtainedAt" type="date" value="${esc(m.obtainedAt)}"></label>
    <label>メモ（一覧やホームに常に表示されます）<textarea name="memo" rows="4" placeholder="例：おてスピMが来たら本命。Lv25で判断">${esc(m.memo)}</textarea></label>
    <input type="hidden" name="ingType" value="${esc(m.ingType || "AAA")}">
    <div class="actions">
      <button class="btn primary">保存</button>
      ${isNew ? "" : `<button type="button" class="btn danger" data-del="mons" data-id="${id}">削除</button>`}
    </div>
  </form>`;
}

function viewSettings() {
  return `
  <h1>設定</h1>
  <section class="card static">
    <b>保存先</b>
    <div class="small">${esc(store.userLabel())}</div>
    ${store.mode === "local" ? '<div class="small warn">ローカルモードです。データはこのブラウザにだけ保存され、スマホとPCで共有されません。SETUP.md の手順で Firebase を設定してください。</div>' : ""}
  </section>
  <section class="card static">
    <b>バックアップ</b>
    <div class="small muted">全データを JSON ファイルで書き出し／読み込みします。読み込むと今のデータは置き換わります。</div>
    <div class="actions">
      <button class="btn" data-act="export">書き出す</button>
      <label class="btn">読み込む<input type="file" accept="application/json" data-act="import" hidden></label>
    </div>
  </section>
  ${store.mode === "firebase" ? '<div class="actions"><button class="btn danger" data-act="signout">ログアウト</button></div>' : ""}
  <section class="small muted">
    ポケモン・スキル・食材データと計算機リンクの形式は
    <a href="https://github.com/nitoyon/pokesleep-tool" target="_blank" rel="noopener">nitoyon/pokesleep-tool</a>（MIT License）を利用しています。
  </section>`;
}

const notFound = () => '<div class="empty">見つかりませんでした。<a href="#/">ホームへ</a></div>';

/* ================= ルーター ================= */
function parseRoute() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  return { name: parts[0] || "", id: parts[1], q: new URLSearchParams(qs || "") };
}

const isEditRoute = () => parseRoute().name.endsWith("-edit");

function render() {
  const { name, id, q } = parseRoute();
  const views = {
    "": viewHome,
    strategies: viewStrategies,
    strategy: () => viewStrategy(id),
    "strategy-edit": () => viewStrategyEdit(id),
    goals: () => viewGoals(q),
    goal: () => viewGoal(id),
    "goal-edit": () => viewGoalEdit(id, q),
    mons: () => viewMons(q),
    mon: () => viewMon(id),
    "mon-edit": () => viewMonEdit(id, q),
    settings: viewSettings,
  };
  app.innerHTML = (views[name] || notFound)();
  document.querySelectorAll("nav.tabs a").forEach((a) => {
    const t = a.dataset.tab;
    const active = t === name || (t === "strategies" && name.startsWith("strategy")) ||
      (t === "goals" && name.startsWith("goal")) || (t === "mons" && name.startsWith("mon"));
    a.classList.toggle("on", active);
  });
  if (name === "mon-edit") setupMonForm();
  pendingRender = false;
}

// データが変わったら再描画。ただし入力中のフォームは消さない
function onData(data) {
  DB = data;
  const typing = app.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (isEditRoute() || typing) { pendingRender = true; return; }
  render();
}

/* ================= 個体フォームの動的部分 ================= */
function setupMonForm() {
  const form = app.querySelector('form[data-form="mon"]');
  const input = form.elements.pokemonJa;
  const info = form.querySelector("[data-pkinfo]");
  const ingBox = form.querySelector("[data-ings]");
  const ingType = form.elements.ingType;

  function refresh() {
    const p = PK_BY_JA.get(input.value.trim());
    if (!p) {
      info.textContent = input.value ? "候補から選んでください" : "";
      ingBox.innerHTML = '<div class="small muted">ポケモンを選ぶと表示されます</div>';
      return;
    }
    info.textContent = `${p.type} ・ ${p.sp}タイプ ・ ${p.skill}`;
    const t = ingType.value || "AAA";
    const opt = (slot, letters, cur) => `<select data-slot="${slot}">${letters.split("").filter((ch) => p.ing["ABC".indexOf(ch)]).map((ch) => {
      const ing = p.ing["ABC".indexOf(ch)];
      return `<option value="${ch}" ${ch === cur ? "selected" : ""}>${esc(ing.n)} ×${ing.c[slot]}</option>`;
    }).join("")}</select>`;
    ingBox.innerHTML = `<div class="grid3">
      <div class="fixed">${esc(p.ing[0].n)} ×${p.ing[0].c[0]}</div>
      ${opt(1, "AB", t[1])}
      ${opt(2, "ABC", t[2])}
    </div>`;
    syncIng();
  }
  function syncIng() {
    const s1 = ingBox.querySelector('[data-slot="1"]');
    const s2 = ingBox.querySelector('[data-slot="2"]');
    ingType.value = "A" + (s1 ? s1.value : "A") + (s2 ? s2.value : "A");
  }
  input.addEventListener("input", refresh);
  input.addEventListener("change", refresh);
  ingBox.addEventListener("change", syncIng);
  refresh();
}

/* ================= イベント ================= */
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === "string" ? v.trim() : v; });
  return o;
}

async function saveForm(form) {
  const kind = form.dataset.form;
  const id = form.dataset.id;
  const d = formData(form);
  let col, obj, dest;
  if (kind === "strategy") {
    col = "strategies";
    obj = { title: d.title, status: d.status, approach: d.approach, body: d.body, order: Number(d.order) || 0 };
  } else if (kind === "goal") {
    col = "goals";
    const p = PK_BY_JA.get(d.pokemonJa);
    obj = {
      title: d.title, strategyId: d.strategyId, status: d.status, pokemon: p ? p.en : "",
      field: d.field, role: d.role, conditions: d.conditions, doneCriteria: d.doneCriteria,
      memo: d.memo, order: Number(d.order) || 0,
    };
  } else {
    col = "mons";
    const p = PK_BY_JA.get(d.pokemonJa);
    if (!p) { toast("ポケモンを候補から選んでください"); return; }
    obj = {
      pokemon: p.en, level: Number(d.level) || 1, skillLv: Number(d.skillLv) || 1, nature: d.nature,
      ingType: d.ingType || "AAA", subskills: [0, 1, 2, 3, 4].map((i) => d[`sub${i}`] || ""),
      status: d.status, goalId: d.goalId, nickname: d.nickname, obtainedAt: d.obtainedAt, memo: d.memo,
    };
  }
  const btn = form.querySelector("button.primary");
  btn.disabled = true;
  try {
    let newId = id;
    if (id === "new") newId = await store.add(col, obj);
    else await store.update(col, id, obj);
    // 「本命」の個体を目標に割り当てたら、未確保／厳選中の目標を自動で「個体確保」に進める
    if (col === "mons" && obj.goalId && obj.status === "main") {
      const g = DB.goals[obj.goalId];
      if (g && statusIdx(g.status) < 2) await store.update("goals", obj.goalId, { status: "secured" });
    }
    toast("保存しました");
    dest = { strategies: "strategy", goals: "goal", mons: "mon" }[col];
    location.hash = `#/${dest}/${newId}`;
  } catch (e) {
    console.error(e);
    toast("保存に失敗しました: " + (e.code || e.message));
    btn.disabled = false;
  }
}

async function removeItem(col, id) {
  const names = { strategies: "この方針", goals: "この目標", mons: "この個体" };
  const extra = col === "mons" ? "\n（博士に送った場合は、状態を「手放した」にすると履歴が残ります）" : "";
  if (!confirm(`${names[col]}を削除します。元に戻せません。よろしいですか？${extra}`)) return;
  if (col === "strategies") {
    for (const g of rows("goals").filter((g) => g.strategyId === id)) await store.update("goals", g.id, { strategyId: "" });
  }
  if (col === "goals") {
    for (const m of rows("mons").filter((m) => m.goalId === id)) await store.update("mons", m.id, { goalId: "" });
  }
  await store.remove(col, id);
  toast("削除しました");
  location.hash = { strategies: "#/strategies", goals: "#/goals", mons: "#/mons" }[col];
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: DB }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pokesleep-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(file) {
  try {
    const obj = JSON.parse(await file.text());
    const data = obj.data || obj;
    if (!data.strategies && !data.goals && !data.mons) throw new Error("形式が違います");
    if (!confirm("今のデータをすべてこのファイルの内容で置き換えます。よろしいですか？")) return;
    await store.replaceAll({ strategies: data.strategies || {}, goals: data.goals || {}, mons: data.mons || {} });
    toast("読み込みました");
  } catch (e) {
    toast("読み込みに失敗しました: " + e.message);
  }
}

function bindEvents() {
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  app.addEventListener("focusout", () => {
    setTimeout(() => { if (pendingRender && !isEditRoute() && !app.contains(document.activeElement)) render(); }, 0);
  });

  app.addEventListener("submit", async (e) => {
    const form = e.target;
    e.preventDefault();
    if (form.dataset.form) return saveForm(form);
    if (form.dataset.quick === "approach") {
      await store.update("strategies", form.dataset.id, { approach: form.elements.approach.value.trim() });
      form.elements.approach.blur();
      toast("アプローチを更新しました");
    }
  });

  app.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-goal-status],[data-del],[data-act]");
    if (!el) return;
    if (el.dataset.goalStatus) {
      await store.update("goals", el.dataset.id, { status: el.dataset.goalStatus });
      toast(`「${label(GOAL_STATUS, el.dataset.goalStatus)}」にしました`);
    } else if (el.dataset.del) {
      await removeItem(el.dataset.del, el.dataset.id);
    } else if (el.dataset.act === "export") {
      exportJson();
    } else if (el.dataset.act === "signout") {
      await store.signOut();
      location.reload();
    }
  });

  app.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.act === "import" && el.files[0]) importJson(el.files[0]);
    if (el.dataset.nav) {
      const { name, q } = parseRoute();
      if (el.value) q.set(el.dataset.nav, el.value); else q.delete(el.dataset.nav);
      location.hash = `#/${name}?${q.toString()}`;
    }
  });
}

function fillDatalists() {
  const opts = (arr) => arr.map((v) => `<option value="${esc(v)}"></option>`).join("");
  document.getElementById("pokedex").innerHTML = opts(POKEDEX.pokemon.map((p) => p.ja));
  document.getElementById("fields").innerHTML = opts(FIELDS);
  document.getElementById("roles").innerHTML = opts(ROLES);
}

/* ================= 起動 ================= */
async function main() {
  fillDatalists();
  try {
    store = await createStore();
  } catch (e) {
    app.innerHTML = `<div class="empty">起動に失敗しました。通信状況か firebase-config.js を確認してください。<br><small>${esc(e.message)}</small></div>`;
    return;
  }
  if (await store.needLogin()) {
    app.innerHTML = `<div class="login">
      <h1>ポケスリ攻略ノート</h1>
      <p class="muted">自分専用のノートです。Google アカウントでログインしてください。</p>
      <button class="btn primary" id="login">Google でログイン</button>
    </div>`;
    document.getElementById("login").onclick = async () => {
      try { await store.signIn(); location.reload(); }
      catch (e) { toast("ログインに失敗しました: " + (e.code || e.message)); }
    };
    return;
  }
  document.body.classList.add("ready");
  bindEvents();
  await store.start(onData);
}

main();
