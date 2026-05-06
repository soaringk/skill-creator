from skill_creator_service.frontmatter import dump_markdown, parse_markdown


def test_parse_and_dump_frontmatter_roundtrip() -> None:
    text = dump_markdown({"slug": "demo", "score": 0.5}, "# Body\n")

    doc = parse_markdown(text)

    assert doc.frontmatter["slug"] == "demo"
    assert doc.frontmatter["score"] == 0.5
    assert doc.body == "# Body\n"


def test_parse_plain_markdown_without_frontmatter() -> None:
    doc = parse_markdown("# Plain\n")

    assert doc.frontmatter == {}
    assert doc.body == "# Plain\n"
