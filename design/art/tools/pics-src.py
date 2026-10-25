# Zdroj obrázkového slovníku: (mřížka, [(klíč, alt česky, [emoji], popis anglicky)×4]).
# Spuštění zapíše design/art/pics.json (jediný zdroj pro prompty, process.py a mapu emoji).
import json
from pathlib import Path

G = [
 ("animals-1", [
  ("pes", "Pes", ["🐶", "🐕", "🦮"], "a friendly brown-and-white dog standing, side view, tail up"),
  ("stene", "Štěně", [], "a small clumsy puppy sitting, big head, floppy ears, clearly a baby dog, same colors as the dog"),
  ("kocka", "Kočka", ["🐱", "🐈"], "a grey tabby cat sitting, side view, long tail curled"),
  ("kotatko", "Koťátko", [], "a tiny fluffy kitten, big head and big eyes, clearly a baby cat, same grey tabby colors"),
 ]),
 ("animals-2", [
  ("krava", "Kráva", ["🐮", "🐄"], "a black-and-white spotted dairy cow standing, side view, pink udder, small horns"),
  ("tele", "Tele", [], "a small calf with long legs, black-and-white spots, clearly a baby cow"),
  ("koza", "Koza", ["🐐"], "a white goat standing, side view, small horns and a beard"),
  ("kuzle", "Kůzle", [], "a tiny white kid goat jumping, no horns, clearly a baby goat"),
 ]),
 ("animals-3", [
  ("ovce", "Ovce", ["🐑"], "a fluffy white sheep with a dark face, standing, side view"),
  ("jehne", "Jehně", [], "a tiny fluffy white lamb, clearly a baby sheep"),
  ("prase", "Prase", ["🐷", "🐖"], "a pink pig standing, side view, curly tail, round snout"),
  ("sele", "Sele", [], "a tiny pink piglet, clearly a baby pig, curly tail"),
 ]),
 ("animals-4", [
  ("kun", "Kůň", ["🐴", "🐎"], "a brown horse with a dark mane standing, side view"),
  ("hribe", "Hříbě", [], "a small foal with very long thin legs, same brown, clearly a baby horse"),
  ("slepice", "Slepice", ["🐔"], "a brown hen standing, side view, small red comb"),
  ("kuratko", "Kuřátko", ["🐥", "🐤", "🐣"], "a tiny round fluffy yellow chick"),
 ]),
 ("animals-5", [
  ("kohout", "Kohout", ["🐓"], "a proud rooster with a big red comb and colorful long tail feathers, side view"),
  ("kachna", "Kachna", ["🦆"], "a mallard duck standing, side view, green head, yellow beak"),
  ("husa", "Husa", ["🪿"], "a white farm goose standing, long neck, orange beak"),
  ("zajic", "Zajíc", ["🐰", "🐇"], "a brown hare sitting, side view, long upright ears"),
 ]),
 ("animals-6", [
  ("jezek", "Ježek", ["🦔"], "a hedgehog, side view, brown spikes, small black nose"),
  ("liska", "Liška", ["🦊"], "a red fox standing, side view, big bushy tail with white tip"),
  ("medved", "Medvěd", ["🐻"], "a brown bear standing on four legs, side view"),
  ("jelen", "Jelen", ["🦌"], "a red deer stag standing, side view, big antlers"),
 ]),
 ("animals-7", [
  ("veverka", "Veverka", ["🐿️", "🐿"], "a red squirrel sitting holding a nut, big bushy tail"),
  ("sova", "Sova", ["🦉"], "a brown owl perched, front view, big round eyes, no clothes"),
  ("zaba", "Žába", ["🐸"], "a green frog sitting, front view, big eyes"),
  ("ryba", "Ryba", ["🐟", "🐠"], "a simple fish, side view, fins and tail, slate blue and ochre"),
 ]),
 ("animals-8", [
  ("motyl", "Motýl", ["🦋"], "a butterfly seen from above, wings spread, ochre and slate blue pattern"),
  ("vcela", "Včela", ["🐝"], "a round bee, side view, yellow and black stripes, small wings"),
  ("beruska", "Beruška", ["🐞"], "a ladybird seen from above, red with black dots"),
  ("snek", "Šnek", ["🐌"], "a snail, side view, spiral shell, two eye stalks"),
 ]),
 ("animals-9", [
  ("slon", "Slon", ["🐘"], "a grey elephant standing, side view, trunk and big ears"),
  ("zirafa", "Žirafa", ["🦒"], "a giraffe standing, side view, very long neck, brown patches"),
  ("lev", "Lev", ["🦁"], "a lion standing, side view, big shaggy mane"),
  ("opice", "Opice", ["🐒", "🐵"], "a brown monkey sitting, front view, long curly tail"),
 ]),
 ("mix-1", [
  ("zebra", "Zebra", ["🦓"], "a zebra standing, side view, black and white stripes"),
  ("tucnak", "Tučňák", ["🐧"], "a penguin standing, front view, black and white, orange feet"),
  ("balonek", "Balónek", ["🎈"], "a single round red balloon on a string"),
  ("strom", "Strom", ["🌳"], "a single round leafy deciduous tree with a brown trunk"),
 ]),
 ("body-1", [
  ("oko", "Oko", ["👁️", "👁", "👀"], "one human eye with eyelashes and an eyebrow, front view"),
  ("ucho", "Ucho", ["👂"], "one human ear, side view, simple"),
  ("nos", "Nos", ["👃"], "one human nose, side view, simple"),
  ("pusa", "Pusa", ["👄"], "a smiling mouth with pink lips, front view"),
 ]),
 ("body-2", [
  ("ruka", "Ruka", ["✋", "🖐️", "🖐", "👋"], "an open child's hand, palm forward, five fingers spread"),
  ("noha", "Noha", ["🦶", "🦵"], "a child's bare foot, side view, five toes"),
  ("zmrzlina", "Zmrzlina", ["🍦", "🍨"], "an ice cream cone with two scoops, pink and cream"),
  ("hrad", "Hrad", ["🏰"], "a small storybook castle with two round towers and a gate"),
 ]),
 ("food-1", [
  ("jablko", "Jablko", ["🍎", "🍏"], "a red apple with a leaf"),
  ("hruska", "Hruška", ["🍐"], "a yellow-green pear with a stalk"),
  ("banan", "Banán", ["🍌"], "a single yellow banana"),
  ("jahoda", "Jahoda", ["🍓"], "a red strawberry with green leaves"),
 ]),
 ("food-2", [
  ("tresne", "Třešně", ["🍒"], "two dark red cherries joined by stalks"),
  ("hrozny", "Hrozny", ["🍇"], "a bunch of green grapes"),
  ("mrkev", "Mrkev", ["🥕"], "an orange carrot with green leaves"),
  ("rajce", "Rajče", ["🍅"], "a round red tomato with a green stalk"),
 ]),
 ("food-3", [
  ("okurka", "Okurka", ["🥒"], "a green cucumber"),
  ("brambora", "Brambora", ["🥔"], "a brown potato"),
  ("chleb", "Chléb", ["🍞"], "a round Czech loaf of bread"),
  ("rohlik", "Rohlík", ["🥐"], "a Czech rohlik, a long crescent-shaped bread roll with poppy seeds"),
 ]),
 ("food-4", [
  ("mleko", "Mléko", ["🥛"], "a glass bottle of white milk next to a glass of milk"),
  ("syr", "Sýr", ["🧀"], "a wedge of yellow cheese with holes"),
  ("vajicko", "Vajíčko", ["🥚"], "a white hen's egg, whole"),
  ("buchta", "Buchta", [], "a Czech buchta: a square golden baked sweet bun dusted with sugar"),
 ]),
 ("toys-1", [
  ("mic", "Míč", [], "a colorful round play ball with stripes"),
  ("panenka", "Panenka", ["🪆"], "a toy doll with braids in a dress, standing"),
  ("kostky", "Kostky", [], "a small stack of wooden toy building blocks in different colors, plain faces"),
  ("auticko", "Autíčko", [], "a small wooden toy car with round wheels"),
 ]),
 ("toys-2", [
  ("plysak", "Plyšák", ["🧸"], "a plush teddy bear sitting"),
  ("kolo", "Kolo", ["🚲"], "a child's bicycle, side view"),
  ("kolobezka", "Koloběžka", ["🛴"], "a kick scooter, side view"),
  ("mesic", "Měsíc", ["🌙", "🌛", "🌜"], "a yellow crescent moon"),
 ]),
 ("vehicles-1", [
  ("auto", "Auto", ["🚗", "🚙"], "a red family car, side view"),
  ("autobus", "Autobus", ["🚌", "🚍"], "a yellow city bus, side view"),
  ("vlak", "Vlak", ["🚂", "🚆", "🚃"], "an old steam locomotive with one carriage, side view"),
  ("tramvaj", "Tramvaj", ["🚋", "🚊"], "a red-and-cream city tram, side view, pantograph on the roof"),
 ]),
 ("vehicles-2", [
  ("letadlo", "Letadlo", ["✈️", "✈", "🛩️"], "a small propeller airplane flying, side view"),
  ("lod", "Loď", ["🚢", "⛵"], "a sailing boat on a small wave, side view"),
  ("traktor", "Traktor", ["🚜"], "a green farm tractor, side view, big rear wheels"),
  ("hasicske-auto", "Hasičské auto", ["🚒"], "a red fire engine with a ladder, side view"),
 ]),
 ("vehicles-3", [
  ("sanitka", "Sanitka", ["🚑"], "a white ambulance van with a red stripe and a blue light, side view, no cross symbol and no lettering"),
  ("policejni-auto", "Policejní auto", ["🚓", "🚔"], "a white-and-blue police car with a blue light on the roof, side view, no lettering"),
  ("destnik", "Deštník", ["☂️", "☂", "☔"], "an open umbrella with a curved handle"),
  ("more", "Moře", ["🌊"], "a big curling blue sea wave"),
 ]),
 ("jobs-1", [
  ("hasic", "Hasič", ["🧑‍🚒", "👨‍🚒", "👩‍🚒"], "a firefighter in a dark uniform with a helmet holding a hose, full body"),
  ("lekar", "Lékař", ["🧑‍⚕️", "👨‍⚕️", "👩‍⚕️"], "a doctor in a white coat with a stethoscope, full body"),
  ("kuchar", "Kuchař", ["🧑‍🍳", "👨‍🍳", "👩‍🍳"], "a cook in a white chef's hat and apron holding a wooden spoon, full body"),
  ("zednik", "Zedník", ["👷"], "a bricklayer in a yellow hard hat holding a trowel next to a small brick wall, full body"),
 ]),
 ("jobs-2", [
  ("prodavacka", "Prodavačka", [], "a shop assistant woman in an apron holding a basket with bread and apples, full body"),
  ("ucitelka", "Učitelka", ["🧑‍🏫", "👩‍🏫", "👨‍🏫"], "a teacher woman with glasses holding a book and pointing at a small blank green chalkboard, full body"),
  ("slunce", "Slunce", ["☀️", "☀", "🌞"], "a round yellow sun with short rays"),
  ("dest", "Déšť", ["🌧️", "🌧"], "a grey cloud with blue raindrops falling"),
 ]),
 ("seasons", [
  ("jaro", "Jaro", [], "SPRING: a small young tree full of pink blossoms, little flowers in fresh grass at its foot"),
  ("leto", "Léto", ["🏖️", "🏖"], "SUMMER: the SAME small tree, now lush dark green with red apples, bright sun above"),
  ("podzim", "Podzim", [], "AUTUMN: the SAME small tree with orange and brown leaves, some leaves falling"),
  ("zima", "Zima", [], "WINTER: the SAME small tree, bare branches covered with snow, a small snowman next to it"),
 ]),
 ("weather-shapes", [
  ("snih", "Sníh", ["❄️", "❄", "🌨️"], "a large six-pointed white-and-pale-blue snowflake"),
  ("vitr", "Vítr", ["💨", "🌬️"], "a puffy cloud with a face blowing wind: curly wind lines and a few leaves flying"),
  ("kruh", "Kruh", [], "a plain flat CIRCLE shape, solid slate blue watercolor fill, ink outline, nothing else"),
  ("ctverec", "Čtverec", [], "a plain flat SQUARE shape, solid ochre watercolor fill, ink outline, nothing else"),
 ]),
 ("shapes-colors", [
  ("trojuhelnik", "Trojúhelník", ["🔺", "🔼"], "a plain flat TRIANGLE shape (equilateral), solid sage green watercolor fill, ink outline, nothing else"),
  ("hvezda", "Hvězda", ["⭐", "🌟"], "a plain flat five-pointed STAR shape, solid mustard yellow watercolor fill, ink outline, nothing else"),
  ("barva-cervena", "Červená kostka", ["🔴", "🟥"], "one plain wooden toy cube painted clearly RED all over, three-quarter view, no letters"),
  ("barva-zluta", "Žlutá kostka", ["🟡", "🟨"], "one plain wooden toy cube painted clearly YELLOW all over, three-quarter view, no letters"),
 ]),
 ("colors", [
  ("barva-zelena", "Zelená kostka", ["🟢", "🟩"], "one plain wooden toy cube painted clearly GREEN all over, three-quarter view, no letters"),
  ("barva-modra", "Modrá kostka", ["🔵", "🟦"], "one plain wooden toy cube painted clearly BLUE all over, three-quarter view, no letters"),
  ("barva-oranzova", "Oranžová kostka", ["🟠", "🟧"], "one plain wooden toy cube painted clearly ORANGE all over, three-quarter view, no letters"),
  ("barva-fialova", "Fialová kostka", ["🟣", "🟪"], "one plain wooden toy cube painted clearly deep VIOLET (bluish purple, not pink) all over, three-quarter view, no letters"),
 ]),
]

COLOR_GRIDS = {"shapes-colors", "colors"}

if __name__ == "__main__":
    out = []
    for gid, items in G:
        assert len(items) == 4, gid
        out.append({"grid": gid, "key": "distance" if gid in COLOR_GRIDS else "magenta",
                    "items": [{"key": k, "alt": a, "emoji": e, "subject": s} for k, a, e, s in items]})
    keys = [i["key"] for g in out for i in g["items"]]
    assert len(keys) == len(set(keys))
    em = [e for g in out for i in g["items"] for e in i["emoji"]]
    assert len(em) == len(set(em)), [x for x in em if em.count(x) > 1]
    Path(__file__).resolve().parent.parent.joinpath("pics.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(len(out), "mřížek,", len(keys), "obrázků,", len(em), "emoji")
