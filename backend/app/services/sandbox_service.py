import os
import subprocess

from app.core.config import settings
from app.utils.errors import AppError


LANGUAGE_CONFIG = {
    "python": {
        "command": ["python", "-"],
    },
    "javascript": {
        "command": ["node", "-"],
    },
}


def execute_code(language: str, source_code: str) -> dict:
    if not source_code.strip():
        raise AppError("Source code is empty", code="empty_code")

    config = LANGUAGE_CONFIG.get(language.lower())
    if not config:
        raise AppError("Unsupported language", code="unsupported_language")

    command = [
        "docker",
        "run",
        "--rm",
        "-i",
        "--network",
        "none",
        "--cpus",
        str(settings.sandbox_cpu),
        "--memory",
        f"{settings.sandbox_memory_mb}m",
        "--pids-limit",
        str(settings.sandbox_pids_limit),
        "--security-opt",
        "no-new-privileges",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m",
        "-w",
        "/home/sandbox",
        settings.sandbox_image,
        *config["command"],
    ]

    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    try:
        completed = subprocess.run(
            command,
            input=source_code,
            capture_output=True,
            text=True,
            timeout=settings.sandbox_timeout_seconds,
            env=env,
        )
    except FileNotFoundError as exc:
        raise AppError("Docker not available", code="docker_missing") from exc
    except subprocess.TimeoutExpired as exc:
        return {
            "stdout": exc.stdout or "",
            "stderr": "Execution timed out",
            "exit_code": 124,
        }

    return {
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "exit_code": completed.returncode,
    }
