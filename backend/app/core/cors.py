import re

# Chrome extension IDs are 32 lowercase letters a–p (base-16 encoding of the public key).
CHROME_EXTENSION_ORIGIN_REGEX = r"^chrome-extension://[a-p]{32}$"

_CHROME_EXTENSION_WILDCARD = "chrome-extension://*"
_CHROME_EXTENSION_PREFIX = "chrome-extension://"


def parse_extra_cors_origins(raw: str) -> list[str]:
    """Return explicit allow_origins entries from CORS_ORIGINS.

    Chrome extension origins are excluded — they are matched via allow_origin_regex.
    The legacy ``chrome-extension://*`` placeholder is ignored.
    """
    origins: list[str] = []
    for part in raw.split(","):
        origin = part.strip()
        if not origin:
            continue
        if origin == _CHROME_EXTENSION_WILDCARD:
            continue
        if origin.startswith(_CHROME_EXTENSION_PREFIX):
            continue
        origins.append(origin)
    return origins


def is_chrome_extension_origin(origin: str) -> bool:
    return bool(re.fullmatch(CHROME_EXTENSION_ORIGIN_REGEX, origin))
