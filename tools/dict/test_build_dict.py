import sys, os, json, gzip
sys.stdout.reconfigure(encoding='utf-8')

def test_dictionary():
    gz_path = os.path.join("public", "dict", "oald9.v1.json.gz")
    assert os.path.exists(gz_path), "Dictionary gzip does not exist"

    with gzip.open(gz_path, "rt", encoding="utf-8") as f:
        data = json.load(f)

    assert "entries" in data
    assert "links" in data
    entries = data["entries"]
    links = data["links"]

    print(f"Loaded {len(entries)} entries, {len(links)} links")

    # Verify example.txt words
    example_words = [
        "convert", "conversion", "convertible", "criticism", "criticize",
        "cultivate", "cultivation", "cultivator", "dramaturge", "dramaturgy",
        "hydrogen", "hydrogenated", "ecological", "ecologist", "imitate"
    ]

    for w in example_words:
        target_w = w
        if w in links:
            target_w = links[w]
        assert target_w in entries, f"Word {w} (target: {target_w}) not found in dictionary"
        entry = entries[target_w]
        # [phon, pos_list, defs, word_raw]
        assert len(entry) == 4, f"Entry {w} does not have 4 elements: {entry}"
        print(f"PASS: {w} -> {entry[3]} [{entry[0]}] {entry[1]} {entry[2][:2]}")

    # Verify common inflections
    inflections = [
        ("ran", "run"),
        ("went", "go"),
        ("children", "child"),
        ("better", "good")
    ]
    for inf, expected in inflections:
        if inf in entries:
            print(f"PASS inflection (direct entry): {inf} -> {entries[inf][3]}")
        else:
            assert inf in links, f"Inflection {inf} not found in links"
            print(f"PASS inflection (link): {inf} -> {links[inf]}")

    print("\nALL DICTIONARY TESTS PASSED!")

if __name__ == '__main__':
    test_dictionary()