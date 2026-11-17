"""nitoyon/pokesleep-tool (MIT) のデータから js/pokedex.js を生成する。

使い方:
  python -I tools/build_pokedex.py <ダウンロードしたファイルのフォルダ> js/pokedex.js

必要なファイル（raw.githubusercontent.com/nitoyon/pokesleep-tool/main/ から取得）:
  src/data/pokemon.json        -> src_data_pokemon.json
  src/i18n/ja/pokemons.json    -> src_i18n_ja_pokemons.json
  src/i18n/ja/skills.json      -> src_i18n_ja_skills.json
  src/i18n/ja/data.json        -> src_i18n_ja_data.json
"""
import json
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path(sys.argv[2])


def load(name):
    return json.loads((src / name).read_text(encoding="utf-8"))


pokemon = load("src_data_pokemon.json")
ja_names = load("src_i18n_ja_pokemons.json")["pokemons"]
ja_skills = load("src_i18n_ja_skills.json")["skills"]
ja_data = load("src_i18n_ja_data.json")
ja_ing = ja_data["ingredients"]
ja_type = ja_data["types"]

SPECIALTY = {"Berries": "きのみ", "Ingredients": "食材", "Skills": "スキル", "All": "オール"}

entries = []
used_ja = set()
for p in pokemon:
    if p.get("skill") == "unknown":
        continue
    ja = ja_names.get(p["name"], p["name"])
    base = ja
    n = 2
    while ja in used_ja:
        ja = f"{base}{n}"
        n += 1
    used_ja.add(ja)
    ings = []
    for key in ("ing1", "ing2", "ing3"):
        ing = p.get(key)
        if ing:
            ings.append({
                "n": ja_ing.get(ing["name"], ing["name"]),
                "c": [ing.get("c1", 0), ing.get("c2", 0), ing.get("c3", 0)],
            })
    skill = p.get("skill", "")
    skill_ja = ja_skills.get(skill, {}).get("name", skill)
    entries.append({
        "en": p["name"],
        "ja": ja,
        "id": p["id"],
        "form": p.get("form", ""),
        "type": ja_type.get(p["type"], p["type"]),
        "sp": SPECIALTY.get(p["specialty"], p["specialty"]),
        "skill": skill_ja,
        "ing": ings,
        "myth": "mythIng" in p,
        "final": p.get("isFullyEvolved", False),
    })

# サブスキル: nitoyon SubSkill.subSkillNames の順番（シリアライズの index に使う）
SUBSKILLS_EN = [
    "Berry Finding S", "Dream Shard Bonus", "Energy Recovery Bonus", "Helping Bonus",
    "Research EXP Bonus", "Skill Level Up M", "Sleep EXP Bonus",
    "Helping Speed M", "Ingredient Finder M", "Inventory Up L", "Inventory Up M",
    "Skill Level Up S", "Skill Trigger M",
    "Helping Speed S", "Ingredient Finder S", "Inventory Up S", "Skill Trigger S",
]
COLOR = ["gold"] * 7 + ["blue"] * 6 + ["white"] * 4
subskills = [
    {"en": en, "ja": ja_data["subskill"][en], "color": COLOR[i]}
    for i, en in enumerate(SUBSKILLS_EN)
]

# 性格: nitoyon Nature.allNatureNames の順番
NATURES = [
    ("Bashful", None, None), ("Hardy", None, None), ("Docile", None, None),
    ("Quirky", None, None), ("Serious", None, None),
    ("Bold", "げんき", "おてスピ"), ("Impish", "げんき", "食材"),
    ("Lax", "げんき", "スキル"), ("Relaxed", "げんき", "EXP"),
    ("Timid", "EXP", "おてスピ"), ("Hasty", "EXP", "げんき"),
    ("Jolly", "EXP", "食材"), ("Naive", "EXP", "スキル"),
    ("Lonely", "おてスピ", "げんき"), ("Adamant", "おてスピ", "食材"),
    ("Naughty", "おてスピ", "スキル"), ("Brave", "おてスピ", "EXP"),
    ("Calm", "スキル", "おてスピ"), ("Gentle", "スキル", "げんき"),
    ("Careful", "スキル", "食材"), ("Sassy", "スキル", "EXP"),
    ("Modest", "食材", "おてスピ"), ("Mild", "食材", "げんき"),
    ("Rash", "食材", "スキル"), ("Quiet", "食材", "EXP"),
]
natures = [
    {"en": en, "ja": ja_data["natures"][en], "up": up, "down": down}
    for en, up, down in NATURES
]

data = {"pokemon": entries, "subskills": subskills, "natures": natures}
out.write_text(
    "// 自動生成ファイル（tools/build_pokedex.py）。直接編集しないでください。\n"
    "// データ出典: nitoyon/pokesleep-tool (MIT License) https://github.com/nitoyon/pokesleep-tool\n"
    "export const POKEDEX = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"pokemon={len(entries)} subskills={len(subskills)} natures={len(natures)} -> {out}")
