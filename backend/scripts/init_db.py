from pathlib import Path

from alembic import command
from alembic.config import Config


def run() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(base_dir / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


if __name__ == "__main__":
    run()
