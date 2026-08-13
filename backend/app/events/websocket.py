import asyncio
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.session import SessionLocal
from app.events.service import list_event_seats

router = APIRouter(prefix="/events", tags=["events"])


@router.websocket("/{event_id}/seats/ws")
async def watch_event_seats(websocket: WebSocket, event_id: UUID) -> None:
    await websocket.accept()

    try:
        while True:
            with SessionLocal() as db:
                seats = list_event_seats(db, event_id)

            await websocket.send_json([seat.model_dump() for seat in seats])
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        return
