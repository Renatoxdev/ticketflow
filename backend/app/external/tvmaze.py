from typing import Any

import httpx

from app.core.errors import ExternalIntegrationError
from app.external.schemas import ExternalCatalogItem

TVMAZE_SEARCH_URL = "https://api.tvmaze.com/search/shows"


def _strip_html(value: str | None) -> str | None:
    if not value:
        return None

    return value.replace("<p>", "").replace("</p>", "").replace("<b>", "").replace("</b>", "").strip()


def _map_show_result(result: dict[str, Any]) -> ExternalCatalogItem | None:
    show = result.get("show")
    if not isinstance(show, dict):
        return None

    external_id = show.get("id")
    title = show.get("name")

    if external_id is None or not title:
        return None

    image = show.get("image")
    image_url = image.get("medium") if isinstance(image, dict) else None

    return ExternalCatalogItem(
        external_id=str(external_id),
        title=title,
        description=_strip_html(show.get("summary")),
        image_url=image_url,
        raw_payload=show,
    )


async def search_shows(query: str, timeout_seconds: float = 5.0) -> list[ExternalCatalogItem]:
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.get(TVMAZE_SEARCH_URL, params={"q": query})
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise ExternalIntegrationError("A busca demorou demais. Tente novamente.") from exc
    except httpx.HTTPStatusError as exc:
        raise ExternalIntegrationError("A busca de títulos está indisponível.") from exc
    except httpx.HTTPError as exc:
        raise ExternalIntegrationError() from exc

    payload = response.json()
    if not isinstance(payload, list):
        raise ExternalIntegrationError("Resposta inválida da busca de títulos.")

    items = [_map_show_result(result) for result in payload if isinstance(result, dict)]
    return [item for item in items if item is not None]
