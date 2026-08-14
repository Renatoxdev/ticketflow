from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import ExternalIntegrationError
from app.external.schemas import ExternalCatalogItem

TMDB_SEARCH_MOVIE_URL = "https://api.themoviedb.org/3/search/movie"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"


def _map_movie_result(movie: dict[str, Any]) -> ExternalCatalogItem | None:
    external_id = movie.get("id")
    title = movie.get("title") or movie.get("original_title")

    if external_id is None or not title:
        return None

    poster_path = movie.get("poster_path")
    image_url = f"{TMDB_IMAGE_BASE_URL}{poster_path}" if isinstance(poster_path, str) else None

    return ExternalCatalogItem(
        external_source="tmdb",
        external_id=str(external_id),
        title=title,
        description=movie.get("overview") or None,
        image_url=image_url,
        raw_payload=movie,
    )


async def search_movies(query: str, timeout_seconds: float = 5.0) -> list[ExternalCatalogItem]:
    if not settings.tmdb_api_key:
        raise ExternalIntegrationError("Chave da TMDb não configurada no backend.")

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.get(
                TMDB_SEARCH_MOVIE_URL,
                params={"query": query, "include_adult": "false", "language": "pt-BR", "page": 1},
                headers={"Authorization": f"Bearer {settings.tmdb_api_key}"},
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise ExternalIntegrationError("A busca demorou demais. Tente novamente.") from exc
    except httpx.HTTPStatusError as exc:
        raise ExternalIntegrationError("A busca de filmes está indisponível.") from exc
    except httpx.HTTPError as exc:
        raise ExternalIntegrationError() from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise ExternalIntegrationError("Resposta inválida da busca de filmes.") from exc
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        raise ExternalIntegrationError("Resposta inválida da busca de filmes.")

    items = [_map_movie_result(result) for result in results if isinstance(result, dict)]
    return [item for item in items if item is not None]
