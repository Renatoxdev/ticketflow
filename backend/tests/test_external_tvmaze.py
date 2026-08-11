from app.external.tvmaze import _map_show_result


def test_maps_tvmaze_result_to_catalog_item() -> None:
    item = _map_show_result(
        {
            "show": {
                "id": 42,
                "name": "Example Show",
                "summary": "<p>A small summary.</p>",
                "image": {"medium": "https://example.com/poster.jpg"},
            }
        }
    )

    assert item is not None
    assert item.external_source == "tvmaze"
    assert item.external_id == "42"
    assert item.title == "Example Show"
    assert item.description == "A small summary."
    assert str(item.image_url) == "https://example.com/poster.jpg"


def test_ignores_invalid_tvmaze_result() -> None:
    assert _map_show_result({"score": 1}) is None
