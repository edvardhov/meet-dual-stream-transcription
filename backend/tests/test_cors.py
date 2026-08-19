from fastapi.testclient import TestClient

from app.core.cors import (
    CHROME_EXTENSION_ORIGIN_REGEX,
    is_chrome_extension_origin,
    parse_extra_cors_origins,
)
from app.main import app

_SAMPLE_EXTENSION_ID = "a" * 32
_SAMPLE_EXTENSION_ORIGIN = f"chrome-extension://{_SAMPLE_EXTENSION_ID}"


def test_parse_extra_cors_origins_skips_extension_placeholders() -> None:
    raw = "chrome-extension://*,chrome-extension://abc,http://localhost:5173"
    assert parse_extra_cors_origins(raw) == ["http://localhost:5173"]


def test_parse_extra_cors_origins_empty_and_whitespace() -> None:
    assert parse_extra_cors_origins("") == []
    assert parse_extra_cors_origins("  ,  ") == []


def test_parse_extra_cors_origins_keeps_multiple_web_origins() -> None:
    raw = "http://localhost:5173, https://app.example.com"
    assert parse_extra_cors_origins(raw) == [
        "http://localhost:5173",
        "https://app.example.com",
    ]


def test_is_chrome_extension_origin_valid_id() -> None:
    assert is_chrome_extension_origin(_SAMPLE_EXTENSION_ORIGIN)


def test_is_chrome_extension_origin_rejects_invalid() -> None:
    assert not is_chrome_extension_origin("chrome-extension://*")
    assert not is_chrome_extension_origin("chrome-extension://tooshort")
    assert not is_chrome_extension_origin("http://localhost:8000")
    assert not is_chrome_extension_origin(
        f"chrome-extension://{'z' * 32}"
    )


def test_chrome_extension_regex_matches_expected_pattern() -> None:
    import re

    assert re.fullmatch(CHROME_EXTENSION_ORIGIN_REGEX, _SAMPLE_EXTENSION_ORIGIN)


def test_cors_preflight_allows_chrome_extension_origin() -> None:
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": _SAMPLE_EXTENSION_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == _SAMPLE_EXTENSION_ORIGIN
