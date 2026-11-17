// にとよん個体値計算機（nitoyon/pokesleep-tool, MIT License）の共有形式で
// 個体をシリアライズし、その個体を入力済みの状態で計算機を開くリンクを作る。
// 形式は src/util/PokemonIv.ts の serialize() に合わせている。
import { POKEDEX } from "./pokedex.js";

const CALC_URL = "https://nitoyon.github.io/pokesleep-tool/iv/index.ja.html";

const FORM = {
  "": 0, Halloween: 1, Holiday: 2, Alola: 3, Paldea: 4, Amped: 5, "Low Key": 6,
  Small: 7, Medium: 8, Large: 9, Jumbo: 10, Captain: 11, Halloween2: 12,
};
const ING_TYPES = ["AAA", "AAB", "AAC", "ABA", "ABB", "ABC"];

export function serializeMon(mon) {
  const p = POKEDEX.pokemon.find((x) => x.en === mon.pokemon);
  if (!p) return null;
  const level = Math.min(Math.max(Number(mon.level) || 1, 1), 127);
  const skillLv = Math.min(Math.max(Number(mon.skillLv) || 1, 1), 8);
  const natureIdx = Math.max(POKEDEX.natures.findIndex((n) => n.en === mon.nature), 0);
  const sub = (i) => {
    const en = (mon.subskills || [])[i];
    const idx = POKEDEX.subskills.findIndex((s) => s.en === en);
    return idx < 0 ? 31 : idx;
  };
  const ingIdx = Math.max(ING_TYPES.indexOf(mon.ingType || "AAA"), 0);

  const a = new Uint16Array(6);
  a[0] = 1 + (p.id << 4);
  a[1] = (FORM[p.form] ?? 0) + (level << 6) + (ingIdx << 13);
  a[2] = (mon.shiny ? 1 : 0) + ((skillLv - 1) << 2) + (natureIdx << 6) + (sub(0) << 11);
  a[3] = sub(1) + (sub(2) << 5) + (sub(3) << 10);
  a[4] = sub(4);
  const b = new Uint8Array(a.buffer);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\//g, "-").substring(0, p.myth ? 16 : 12);
}

export function calcUrl(mon) {
  const s = serializeMon(mon);
  return s ? `${CALC_URL}#p=${s}` : CALC_URL;
}
