import hashlib
import json
from pathlib import Path
import time
import pytest
from fastapi.testclient import TestClient
from app import create_app, Settings, parse_confidence


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            root=tmp_path,
            run_worker=False,
            per_client_daily=20,
            global_daily=50,
            max_active=10,
        )
    )
    with TestClient(app) as client:
        yield client


def submit(client, filename="candidate.pdb"):
    return client.post(
        "/jobs", files=[("structures", (filename, b"ATOM  dummy", "text/plain"))]
    )


def test_job_private_and_filenames_never_control_disk_paths(client):
    response = submit(client, "../../candidate.pdb")
    assert response.status_code == 202
    data = response.json()
    headers = {"Authorization": "Bearer " + data["token"]}
    assert client.get("/jobs/" + data["id"]).status_code == 404
    assert (
        client.get("/jobs/" + data["id"], headers=headers).json()["state"] == "queued"
    )
    work = client.app.state.store.root / data["id"]
    saved = json.loads((work / "request.json").read_text())
    assert saved["structures"][0]["filename"] == "candidate.pdb"
    assert (work / "inputs/model-0001.pdb").read_bytes() == b"ATOM  dummy"
    assert data["token"] not in (
        client.app.state.store.root / "jobs.sqlite"
    ).read_bytes().decode("latin1")
    assert (
        client.get(
            "/jobs/" + data["id"] + "/files/../../client-salt", headers=headers
        ).status_code
        == 404
    )
    assert client.delete("/jobs/" + data["id"], headers=headers).status_code == 200
    assert not work.exists()


def test_input_limits_and_formats(client):
    assert submit(client, "bad.exe").status_code == 400
    assert (
        client.post("/jobs", files=[("structures", ("empty.pdb", b""))]).status_code
        == 400
    )
    assert (
        client.post(
            "/jobs",
            files=[
                ("structures", ("same.pdb", b"a")),
                ("structures", ("same.pdb", b"b")),
            ],
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/jobs",
            files=[("structures", ("a.pdb", b"a"))],
            data={"min_cluster_size": "1"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/jobs",
            files=[("structures", ("a.pdb", b"a"))],
            headers={"Origin": "https://untrusted.example"},
        ).status_code
        == 403
    )


def test_upload_size_is_enforced_and_partial_upload_removed(tmp_path):
    app = create_app(
        Settings(root=tmp_path, run_worker=False, max_file_bytes=8, max_total_bytes=12)
    )
    with TestClient(app) as client:
        response = client.post("/jobs", files=[("structures", ("large.pdb", b"x" * 9))])
        assert response.status_code == 413
        assert not list(tmp_path.glob("*/inputs/*"))


def test_chunked_body_limit(tmp_path):
    app = create_app(
        Settings(root=tmp_path, run_worker=False, max_file_bytes=10, max_total_bytes=10)
    )
    with TestClient(app) as client:
        payload = (
            b'--abc\r\nContent-Disposition: form-data; name="structures"; filename="x.pdb"\r\n\r\n'
            + b"x" * (1024 * 1024 + 100)
            + b"\r\n--abc--\r\n"
        )
        response = client.post(
            "/jobs",
            content=iter([payload]),
            headers={"Content-Type": "multipart/form-data; boundary=abc"},
        )
        assert response.status_code == 413


def test_rate_limit_and_expiry(tmp_path):
    app = create_app(Settings(root=tmp_path, run_worker=False, max_active=1))
    with TestClient(app) as client:
        data = submit(client).json()
        assert submit(client).status_code == 429
        with app.state.store.db() as db:
            db.execute(
                "UPDATE jobs SET expires=? WHERE id=?", (time.time() - 1, data["id"])
            )
        assert (
            client.get(
                "/jobs/" + data["id"],
                headers={"Authorization": "Bearer " + data["token"]},
            ).status_code
            == 410
        )
        app.state.store.cleanup()
        assert not (tmp_path / data["id"]).exists()


def test_confidence_is_optional_validated_and_never_substituted():
    assert parse_confidence(
        "filename,method,iptm,mean_plddt\na.pdb,test,,\n", {"a.pdb"}
    )["a.pdb"] == {"method": "test", "iptm": None, "mean_plddt": None}
    for value in ["NaN", "Infinity", "-1", "1.01"]:
        with pytest.raises(Exception):
            parse_confidence(f"filename,iptm\na.pdb,{value}\n", {"a.pdb"})
    with pytest.raises(Exception):
        parse_confidence("filename,iptm\nother.pdb,0.5\n", {"a.pdb"})
