from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.auth.router import router as auth_router
from app.core.config import settings
from app.core.errors import AppError
from app.events.router import router as events_router
from app.events.websocket import router as events_websocket_router
from app.gate.router import router as gate_router
from app.organizer.router import router as organizer_router
from app.tickets.router import router as tickets_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
def handle_app_error(_, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(organizer_router)
app.include_router(events_router)
app.include_router(events_websocket_router)
app.include_router(tickets_router)
app.include_router(gate_router)
app.include_router(auth_router)

frontend_dist = Path(__file__).resolve().parents[1] / "frontend_dist"

if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:

    @app.get("/")
    def root() -> dict[str, str]:
        return {"app": "TicketFlow API", "status": "ok"}
