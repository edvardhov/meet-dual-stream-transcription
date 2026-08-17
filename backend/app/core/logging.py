import logging
from logging.config import dictConfig


def configure_logging(level: str = "INFO") -> None:
    """Attach a handler to the app logger.

    Uvicorn only configures its own loggers, so without this every
    logger.warning() in app.* is discarded.
    """
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "fmt": "%(levelprefix)s %(name)s - %(message)s",
                    "()": "uvicorn.logging.DefaultFormatter",
                }
            },
            "handlers": {
                "default": {
                    "formatter": "default",
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stderr",
                }
            },
            "loggers": {
                "app": {"handlers": ["default"], "level": level, "propagate": False},
            },
        }
    )
    logging.getLogger("app").debug("Logging configured at %s", level)
