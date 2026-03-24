"""
Dashboard Authentication Module
Provides session-based auth middleware and login/logout endpoints.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

DASHBOARD_PASSWORD: str = os.getenv("DASHBOARD_PASSWORD", "")
SESSION_TTL_SECONDS = 86400  # 24 hours

# UUID -> expiry datetime
_sessions: Dict[str, datetime] = {}

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


def _create_session() -> str:
    token = str(uuid.uuid4())
    _sessions[token] = datetime.now(timezone.utc) + timedelta(seconds=SESSION_TTL_SECONDS)
    return token


def _is_valid(token: str) -> bool:
    expiry = _sessions.get(token)
    if expiry is None:
        return False
    if datetime.now(timezone.utc) > expiry:
        del _sessions[token]
        return False
    return True


def _token_from_request(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.cookies.get("auth_token")


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    if not DASHBOARD_PASSWORD:
        # Auth disabled — return a dummy token so clients behave consistently
        token = _create_session()
        return JSONResponse({"token": token, "expires_in": SESSION_TTL_SECONDS})

    if body.password != DASHBOARD_PASSWORD:
        return JSONResponse(status_code=401, content={"error": "invalid_password"})

    token = _create_session()
    response = JSONResponse({"token": token, "expires_in": SESSION_TTL_SECONDS})
    response.set_cookie(
        "auth_token",
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
    )
    return response


@router.post("/logout")
async def logout(request: Request):
    token = _token_from_request(request)
    if token and token in _sessions:
        del _sessions[token]
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie("auth_token")
    return response


@router.get("/status")
async def auth_status(request: Request):
    auth_enabled = bool(DASHBOARD_PASSWORD)
    token = _token_from_request(request)
    authenticated = (not auth_enabled) or _is_valid(token or "")
    return {"authenticated": authenticated, "auth_enabled": auth_enabled}


# Paths that never require authentication
_PUBLIC_PREFIXES = ("/api/auth/", "/login", "/static/")


class AuthMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated access when DASHBOARD_PASSWORD is set."""

    async def dispatch(self, request: Request, call_next):
        if not DASHBOARD_PASSWORD:
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
            return await call_next(request)

        token = _token_from_request(request)
        if token and _is_valid(token):
            return await call_next(request)

        # API routes get JSON 401; page routes redirect to /login
        if path.startswith("/api/"):
            return JSONResponse(
                status_code=401,
                content={"error": "unauthorized", "detail": "Authentication required"},
            )
        return RedirectResponse(url="/login")
