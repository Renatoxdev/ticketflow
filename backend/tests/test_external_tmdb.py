from app.external.tmdb import _map_movie_result


def test_maps_tmdb_result_to_catalog_item() -> None:
    item = _map_movie_result(
        {
            "id": 42,
            "title": "Example Movie",
            "overview": "A small summary.",
            "poster_path": "/poster.jpg",
        }
    )

    assert item is not None
    assert item.external_source == "tmdb"
    assert item.external_id == "42"
    assert item.title == "Example Movie"
    assert item.description == "A small summary."
    assert str(item.image_url) == "https://image.tmdb.org/t/p/w500/poster.jpg"


def test_ignores_invalid_tmdb_result() -> None:
    assert _map_movie_result({"overview": "Missing id and title."}) is None
