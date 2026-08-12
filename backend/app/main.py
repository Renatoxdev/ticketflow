from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth.router import router as auth_router
from app.core.config import settings
from app.core.errors import AppError
from app.events.router import router as events_router
from app.gate.router import router as gate_router
from app.organizer.router import router as organizer_router
from app.tickets.router import router as tickets_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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


@app.get("/")
def root() -> dict[str, str]:
    return {"app": "TicketFlow API", "status": "ok"}


app.include_router(organizer_router)
app.include_router(events_router)
app.include_router(tickets_router)
app.include_router(gate_router)
app.include_router(auth_router)
