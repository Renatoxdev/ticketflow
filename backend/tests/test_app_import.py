from app.main import app


def test_app_registers_phase_two_routes() -> None:
    paths = {
        route.path
        for app_route in app.routes
        for route in getattr(getattr(app_route, "original_router", None), "routes", [app_route])
        if hasattr(route, "path")
    }

    assert "/organizer/external-catalog" in paths
    assert "/organizer/events" in paths
    assert "/events" in paths
    assert "/payments/pix" in paths
    assert "/customer/tickets/{ticket_id}/qr" in paths
    assert "/tickets/share/{token}" in paths
    assert "/gate/check-ins" in paths
