import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

DB_PATH = os.environ.get("APP_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "app.db"))

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _enable_sqlite_fk(dbapi_connection, _record):
    # SQLite ignores FOREIGN KEY constraints unless this pragma is set on
    # every connection — without it, the FKs on Task.project/psrc and the
    # project_* tables are documentation only, never actually enforced.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
