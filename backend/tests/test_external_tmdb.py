import pytest

from app.core.errors import ExternalIntegrationError
from app.external import tmdb
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


@pytest.mark.asyncio
async def test_invalid_json_from_tmdb_becomes_controlled_integration_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class InvalidJsonResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> object:
            raise ValueError("invalid json")

    class FakeClient:
        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, *args: object, **kwargs: object) -> InvalidJsonResponse:
            return InvalidJsonResponse()

    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", "test-key")
    monkeypatch.setattr(tmdb.httpx, "AsyncClient", lambda **kwargs: FakeClient())

    with pytest.raises(ExternalIntegrationError, match="Resposta inválida"):
        await tmdb.search_movies("Inception")
