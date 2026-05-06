from __future__ import annotations

from fastapi.routing import APIRoute

from skill_creator_service.main import app, require_admin


def test_only_promote_route_requires_admin_token() -> None:
    protected_routes = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        dependency_calls = [dependency.call for dependency in route.dependant.dependencies]
        if require_admin in dependency_calls:
            protected_routes.append((route.path, route.methods))

    assert protected_routes == [("/api/skills/{slug}/promote", {"POST"})]
