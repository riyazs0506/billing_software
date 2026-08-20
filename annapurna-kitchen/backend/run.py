"""Annapurna Kitchen — backend entry point.

Usage:
    python run.py                 # development server
    flask --app run:app db upgrade
    flask --app run:app seed      # development seed data
"""
import os

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402  (import after .env is loaded)

app = create_app(os.getenv("FLASK_ENV", "development"))


if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "5000")),
        debug=app.config["DEBUG"],
    )
