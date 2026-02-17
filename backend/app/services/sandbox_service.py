import os
import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings
from app.utils.errors import AppError


LANGUAGE_CONFIG = {
    "python": {
        "filename": "main.py",
        "command": ["python", "/workspace/main.py"],
    },
    "javascript": {
        "filename": "main.js",
        "command": ["node", "/workspace/main.js"],
    },
}


def execute_code(language: str, source_code: str) -> dict:
    if not source_code.strip():
        raise AppError("Source code is empty", code="empty_code")

    config = LANGUAGE_CONFIG.get(language.lower())
    if not config:
        raise AppError("Unsupported language", code="unsupported_language")

    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = Path(tmpdir) / config["filename"]
        file_path.write_text(source_code, encoding="utf-8")

        command = [
            "docker",
            "run",
            "--rm",
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
            "-v",
            f"{tmpdir}:/workspace:ro",
            "-w",
            "/workspace",
            settings.sandbox_image,
            *config["command"],
        ]

        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        try:
            completed = subprocess.run(
                command,
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
