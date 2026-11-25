"""Single-worker analysis API with bounded uploads and private, expiring jobs."""

from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager, contextmanager
import csv
from dataclasses import dataclass
import fcntl
import hashlib
import hmac
import io
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.datastructures import UploadFile

SERVICE_ROOT = Path(__file__).resolve().parent
TERMINAL = ("completed", "partial", "failed", "cancelled")


@dataclass
class Settings:
    root: Path
    origins: tuple[str, ...] = (
        "http://127.0.0.1:3835",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )
    max_files: int = 125
    max_file_bytes: int = 25 * 1024 * 1024
    max_total_bytes: int = 100 * 1024 * 1024
    max_active: int = 3
    per_client_daily: int = 3
    global_daily: int = 20
    retention_seconds: int = 86400
    timeout_seconds: int = 7200
    run_worker: bool = True

    @classmethod
    def environment(cls):
        return cls(
            root=Path(os.environ.get("AMYLOID_DATA_DIR", "./.data")).resolve(),
            origins=tuple(
                v.strip()
                for v in os.environ.get(
                    "AMYLOID_ALLOWED_ORIGINS",
                    "http://127.0.0.1:3835,http://localhost:3000,http://127.0.0.1:3000",
                ).split(",")
                if v.strip()
            ),
            max_files=int(os.environ.get("AMYLOID_MAX_FILES", "125")),
            max_active=int(os.environ.get("AMYLOID_MAX_ACTIVE_JOBS", "3")),
            per_client_daily=int(os.environ.get("AMYLOID_CLIENT_JOBS_PER_DAY", "3")),
            global_daily=int(os.environ.get("AMYLOID_JOBS_PER_DAY", "20")),
            retention_seconds=int(os.environ.get("AMYLOID_RETENTION_SECONDS", "86400")),
            timeout_seconds=int(os.environ.get("AMYLOID_JOB_TIMEOUT", "7200")),
        )


def terminate(process):
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
    except ProcessLookupError:
        process.wait()


class Store:
    def __init__(self, config):
        self.config = config
        self.root = config.root
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.db() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, token_hash TEXT, client_hash TEXT, state TEXT, created REAL, expires REAL, error TEXT)"
            )
        salt = self.root / "client-salt"
        if not salt.exists():
            salt.write_bytes(secrets.token_bytes(32))
            salt.chmod(0o600)
        self.salt = salt.read_bytes()

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.root / "jobs.sqlite", timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def client(self, host):
        return hmac.new(self.salt, host.encode(), hashlib.sha256).hexdigest()

    def admit(self, client):
        identity, token, now = (
            secrets.token_hex(16),
            secrets.token_urlsafe(32),
            time.time(),
        )
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if (
                db.execute(
                    "SELECT COUNT(*) FROM jobs WHERE state NOT IN ('completed','partial','failed','cancelled')"
                ).fetchone()[0]
                >= self.config.max_active
            ):
                raise HTTPException(
                    429, "The analysis queue is full. Please try again later."
                )
            if (
                db.execute(
                    "SELECT COUNT(*) FROM jobs WHERE created > ?", (now - 86400,)
                ).fetchone()[0]
                >= self.config.global_daily
            ):
                raise HTTPException(
                    429,
                    "The service has reached its daily analysis limit. Please try again tomorrow.",
                )
            if (
                db.execute(
                    "SELECT COUNT(*) FROM jobs WHERE client_hash=? AND created>?",
                    (client, now - 86400),
                ).fetchone()[0]
                >= self.config.per_client_daily
            ):
                raise HTTPException(
                    429,
                    "Your daily analysis limit has been reached. Please try again tomorrow.",
                )
            db.execute(
                "INSERT INTO jobs VALUES (?,?,?,?,?,?,?)",
                (
                    identity,
                    hashlib.sha256(token.encode()).hexdigest(),
                    client,
                    "uploading",
                    now,
                    now + self.config.retention_seconds,
                    None,
                ),
            )
        (self.root / identity / "inputs").mkdir(parents=True, mode=0o700)
        return identity, token

    def update(self, identity, state, error=None):
        with self.db() as db:
            db.execute(
                "UPDATE jobs SET state=?,error=? WHERE id=?", (state, error, identity)
            )

    def get(self, identity):
        with self.db() as db:
            return db.execute("SELECT * FROM jobs WHERE id=?", (identity,)).fetchone()

    def authenticate(self, identity, request):
        if not re.fullmatch(r"[a-f0-9]{32}", identity):
            raise HTTPException(404, "Job not found.")
        row = self.get(identity)
        header = request.headers.get("authorization", "")
        token = header.removeprefix("Bearer ") if header.startswith("Bearer ") else ""
        if row is None or not hmac.compare_digest(
            row["token_hash"], hashlib.sha256(token.encode()).hexdigest()
        ):
            raise HTTPException(404, "Job not found.")
        if row["expires"] <= time.time():
            raise HTTPException(
                410, "This job has expired and its files are no longer available."
            )
        return row

    def cleanup(self):
        with self.db() as db:
            db.execute(
                "UPDATE jobs SET state='cancel_requested' WHERE expires<=? AND state='running'",
                (time.time(),),
            )
            rows = db.execute(
                "SELECT id FROM jobs WHERE expires<=? AND state NOT IN ('running','cancel_requested')",
                (time.time(),),
            ).fetchall()
            for row in rows:
                shutil.rmtree(self.root / row["id"], ignore_errors=True)
            db.executemany(
                "DELETE FROM jobs WHERE id=? AND created<=?",
                [(row["id"], time.time() - 86400) for row in rows],
            )

    def worker(self, stop):
        last_cleanup = 0
        while not stop.is_set():
            if time.monotonic() - last_cleanup > 60:
                self.cleanup()
                last_cleanup = time.monotonic()
            with self.db() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute(
                    "SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1"
                ).fetchone()
                if row:
                    db.execute(
                        "UPDATE jobs SET state='running' WHERE id=?", (row["id"],)
                    )
            if row is None:
                stop.wait(0.5)
                continue
            identity = row["id"]
            work = self.root / identity
            env = {
                **os.environ,
                "OMP_NUM_THREADS": "1",
                "OPENBLAS_NUM_THREADS": "1",
                "MKL_NUM_THREADS": "1",
                "NUMEXPR_NUM_THREADS": "1",
                "PYTHONUNBUFFERED": "1",
                "AMYLOID_OWNED_PROCESS_GROUP": "1",
            }
            process = None
            try:
                with (work / "worker.log").open("w") as log:
                    process = subprocess.Popen(
                        [sys.executable, "-m", "analysis.pipeline", str(work)],
                        cwd=SERVICE_ROOT,
                        stdout=log,
                        stderr=log,
                        env=env,
                        start_new_session=True,
                    )
                    began = time.monotonic()
                    reason = None
                    disk_check = 0
                    while process.poll() is None:
                        current = self.get(identity)
                        if time.monotonic() - last_cleanup > 60:
                            self.cleanup()
                            last_cleanup = time.monotonic()
                        if time.monotonic() - disk_check > 15:
                            disk_check = time.monotonic()
                            used = sum(
                                p.stat().st_size for p in work.rglob("*") if p.is_file()
                            )
                            if used > int(
                                os.environ.get(
                                    "AMYLOID_MAX_JOB_DISK_BYTES", str(2 * 1024**3)
                                )
                            ):
                                reason = "The job exceeded its disk budget. Try a smaller pool."
                        if stop.is_set():
                            reason = "The analysis service restarted. Please submit the job again."
                        elif current is None or current["state"] == "cancel_requested":
                            reason = "cancelled"
                        elif time.monotonic() - began > self.config.timeout_seconds:
                            reason = "The job exceeded the analysis time limit. Try a smaller pool."
                        if reason:
                            terminate(process)
                            break
                        stop.wait(0.5)
                    current = self.get(identity)
                    if current is None or current["state"] == "cancel_requested":
                        reason = "cancelled"
                    if reason == "cancelled":
                        shutil.rmtree(work, ignore_errors=True)
                        self.update(identity, "cancelled")
                        continue
                    if reason or process.returncode:
                        self.update(
                            identity,
                            "failed",
                            reason
                            or "The analysis worker failed. Try a smaller pool or check the input structures.",
                        )
                        continue
                    try:
                        result = json.loads((work / "result.json").read_text())
                        self.update(identity, result["state"])
                    except (OSError, ValueError, KeyError):
                        self.update(
                            identity,
                            "failed",
                            "The analysis did not produce a complete result.",
                        )
            except Exception as error:
                if process is not None:
                    terminate(process)
                self.update(
                    identity,
                    "failed",
                    "The worker could not complete this job. Please try again.",
                )
                print(
                    f"Worker job {identity}: {type(error).__name__}: {error}",
                    file=sys.stderr,
                    flush=True,
                )


class BodyLimit:
    def __init__(self, app, limit):
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        size = 0

        async def bounded():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > self.limit:
                raise HTTPException(413, "Upload exceeds the total size limit.")
            return message

        await self.app(scope, bounded, send)


def parse_confidence(text, filenames):
    reader = csv.DictReader(io.StringIO(text))
    if (
        not reader.fieldnames
        or "filename" not in reader.fieldnames
        or len(set(reader.fieldnames)) != len(reader.fieldnames)
    ):
        raise HTTPException(
            400, "Confidence CSV needs a filename column and unique column names."
        )
    rows = list(reader)
    if len(rows) > len(filenames):
        raise HTTPException(400, "Confidence CSV has too many rows.")
    result = {}
    for row in rows:
        name = row.get("filename", "")
        if name not in filenames or name in result:
            raise HTTPException(
                400,
                "Confidence CSV filenames must uniquely match the uploaded structures.",
            )
        item = {
            "method": (row.get("method") or "unspecified").strip()[:80] or "unspecified"
        }
        for key, upper in [("iptm", 1), ("mean_plddt", 100)]:
            value = (row.get(key) or "").strip()
            if not value:
                item[key] = None
                continue
            try:
                number = float(value)
            except ValueError:
                raise HTTPException(400, f"Invalid {key} in confidence CSV.")
            if not math.isfinite(number) or not 0 <= number <= upper:
                raise HTTPException(400, f"{key} is outside its allowed range.")
            item[key] = number
        result[name] = item
    return result


def create_app(config=None):
    config = config or Settings.environment()
    store = Store(config)

    @asynccontextmanager
    async def lifespan(app):
        lock = (config.root / "worker.lock").open("w")
        thread = None
        stop = threading.Event()
        if config.run_worker:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError("Run one API process per analysis data volume.")
            with store.db() as db:
                db.execute(
                    "UPDATE jobs SET state='failed',error='The service restarted during this job. Please submit it again.' WHERE state IN ('running','uploading','cancel_requested')"
                )
            thread = threading.Thread(target=store.worker, args=(stop,), daemon=True)
            thread.start()
            app.state.worker_thread = thread
        try:
            yield
        finally:
            stop.set()
            if thread:
                thread.join(timeout=10)
            lock.close()

    app = FastAPI(
        title="Amyloid Analysis", lifespan=lifespan, docs_url=None, redoc_url=None
    )
    app.state.store = store
    app.add_middleware(BodyLimit, limit=config.max_total_bytes + 1024 * 1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.origins),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition"],
        allow_credentials=False,
    )

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.get("/health")
    async def health():
        if (
            config.run_worker
            and not getattr(app.state, "worker_thread", None).is_alive()
        ):
            raise HTTPException(503, "The analysis worker is unavailable.")
        return {
            "status": "ok",
            "max_files": config.max_files,
            "max_file_bytes": config.max_file_bytes,
            "max_total_bytes": config.max_total_bytes,
            "retention_hours": config.retention_seconds / 3600,
        }

    @app.post("/jobs", status_code=202)
    async def submit(request: Request):
        origin = request.headers.get("origin")
        if origin and origin not in config.origins:
            raise HTTPException(403, "This website origin is not allowed.")
        client = store.client(request.client.host if request.client else "unknown")
        identity, token = store.admit(client)
        work = config.root / identity
        try:
            async with asyncio.timeout(300), request.form(
                max_files=config.max_files + 1,
                max_fields=4,
                max_part_size=config.max_file_bytes,
            ) as form:
                uploads = form.getlist("structures")
                if not 1 <= len(uploads) <= config.max_files or not all(
                    isinstance(f, UploadFile) for f in uploads
                ):
                    raise HTTPException(
                        400,
                        f"Select between 1 and {config.max_files} coordinate files.",
                    )
                options = {}
                for key, default, low, high in [
                    ("min_cluster_size", 10, 2, 125),
                    ("min_samples", 3, 1, 124),
                    ("max_candidates", 10, 1, 20),
                ]:
                    try:
                        value = int(str(form.get(key, default)))
                    except ValueError:
                        raise HTTPException(400, f"Invalid {key}.")
                    if not low <= value <= high:
                        raise HTTPException(400, f"{key} is outside the allowed range.")
                    options[key] = value
                entries = []
                names = set()
                total = 0
                for index, upload in enumerate(uploads, 1):
                    name = (upload.filename or "").replace("\\", "/").split("/")[-1]
                    suffix = Path(name).suffix.lower()
                    if (
                        suffix not in (".pdb", ".cif", ".mmcif")
                        or len(name) > 160
                        or any(ord(c) < 32 for c in name)
                    ):
                        raise HTTPException(
                            400,
                            "Use PDB or mmCIF files with short, ordinary filenames.",
                        )
                    if name in names:
                        raise HTTPException(
                            400, "Each structure needs a unique filename."
                        )
                    names.add(name)
                    model = f"model-{index:04d}"
                    stored = model + suffix
                    size = 0
                    digest = hashlib.sha256()
                    with (work / "inputs" / stored).open("wb") as handle:
                        while block := await upload.read(1024 * 1024):
                            size += len(block)
                            total += len(block)
                            if (
                                size > config.max_file_bytes
                                or total > config.max_total_bytes
                            ):
                                raise HTTPException(
                                    413,
                                    "The upload exceeds the file or total size limit.",
                                )
                            digest.update(block)
                            handle.write(block)
                    if size == 0:
                        raise HTTPException(
                            400, "Empty structure files cannot be analyzed."
                        )
                    entries.append(
                        {
                            "id": model,
                            "filename": name,
                            "stored_name": stored,
                            "sha256": digest.hexdigest(),
                            "bytes": size,
                        }
                    )
                confidence = form.get("confidence")
                if confidence:
                    if not isinstance(confidence, UploadFile):
                        raise HTTPException(
                            400, "Confidence metadata must be a CSV file."
                        )
                    raw = await confidence.read(65537)
                    if len(raw) > 65536:
                        raise HTTPException(
                            413, "Confidence CSV must be 64 KB or smaller."
                        )
                    try:
                        metadata = parse_confidence(raw.decode("utf-8-sig"), names)
                    except UnicodeError:
                        raise HTTPException(400, "Confidence CSV must use UTF-8 text.")
                    for entry in entries:
                        entry["confidence"] = metadata.get(entry["filename"], {})
                (work / "request.json").write_text(
                    json.dumps({"structures": entries, "settings": options}, indent=2)
                    + "\n"
                )
            store.update(identity, "queued")
            return {
                "id": identity,
                "token": token,
                "state": "queued",
                "expires_at": store.get(identity)["expires"],
            }
        except (Exception, asyncio.CancelledError) as error:
            shutil.rmtree(work, ignore_errors=True)
            store.update(identity, "failed", "Upload was not accepted.")
            if isinstance(error, TimeoutError):
                raise HTTPException(
                    408, "The upload timed out. Please try a smaller batch."
                )
            raise

    @app.get("/jobs/{identity}")
    async def status(identity: str, request: Request):
        row = store.authenticate(identity, request)
        work = config.root / identity
        output = {
            "id": identity,
            "state": row["state"],
            "error": row["error"],
            "expires_at": row["expires"],
        }
        if (work / "progress.json").exists():
            output["progress"] = json.loads((work / "progress.json").read_text())
        if row["state"] in ("completed", "partial"):
            output["result"] = json.loads((work / "result.json").read_text())
        return output

    @app.get("/jobs/{identity}/download")
    async def download(identity: str, request: Request):
        row = store.authenticate(identity, request)
        if row["state"] not in ("completed", "partial"):
            raise HTTPException(409, "The analysis archive is not ready.")
        return FileResponse(
            config.root / identity / "results.zip",
            filename="amyloid-analysis.zip",
            media_type="application/zip",
        )

    @app.get("/jobs/{identity}/files/{filename:path}")
    async def artifact(identity: str, filename: str, request: Request):
        row = store.authenticate(identity, request)
        if row["state"] not in ("completed", "partial"):
            raise HTTPException(409, "Results are not ready.")
        work = config.root / identity
        result = json.loads((work / "result.json").read_text())
        allowed = {
            v for item in result["structures"] for v in item.get("files", {}).values()
        }
        if filename not in allowed:
            raise HTTPException(404, "File not found.")
        path = work / "artifacts" / filename
        return FileResponse(path, filename=path.name)

    @app.delete("/jobs/{identity}")
    async def remove(identity: str, request: Request):
        row = store.authenticate(identity, request)
        # Serialize with the worker claim so queued jobs cannot start while deleted.
        with store.db() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT state FROM jobs WHERE id=?", (identity,)
            ).fetchone()
            if current is None:
                raise HTTPException(410, "This job has expired.")
            if current["state"] in ("running", "cancel_requested"):
                db.execute(
                    "UPDATE jobs SET state='cancel_requested' WHERE id=?", (identity,)
                )
            else:
                shutil.rmtree(config.root / identity, ignore_errors=True)
                db.execute("UPDATE jobs SET state='cancelled' WHERE id=?", (identity,))
        return {
            "state": (
                "cancel_requested"
                if current["state"] in ("running", "cancel_requested")
                else "cancelled"
            )
        }

    return app


app = create_app()
