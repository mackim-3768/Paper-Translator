from pathlib import Path
from uuid import uuid4
from typing import Optional
import time

from fastapi import FastAPI, File, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse, HTMLResponse

from app.config import settings
from app.infra.job_repository import JobRepository
from app.infra.jobs import translate_paper
from app.infra.storage import get_storage


app = FastAPI(title="Paper Translator API")

job_store = JobRepository(settings.db_url)
storage = get_storage()


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF만 업로드 가능합니다.")

    job_id = str(uuid4())

    contents = await file.read()
    storage.save_original(job_id, contents)

    # TTL 설정: 현재 시각 + job_ttl_days
    ttl_days = getattr(settings, "job_ttl_days", 7)
    expires_at = int(time.time()) + ttl_days * 24 * 60 * 60

    job_store.create_job(job_id, file_name=file.filename, expires_at=expires_at)
    translate_paper.delay(job_id)

    return {"job_id": job_id}


@app.get("/status/{job_id}")
def status(job_id: str):
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="존재하지 않는 job_id")

    resp = {
        "job_id": job_id,
        "status": job.get("lastStatus"),
    }

    if job.get("errorCode") is not None:
        resp["errorCode"] = job["errorCode"]
    if job.get("pageCount") is not None:
        resp["pageCount"] = job["pageCount"]
    if job.get("expiresAt") is not None:
        resp["expiresAt"] = job["expiresAt"]

    return resp


@app.get("/jobs")
def list_jobs(
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    status_filter: str = Query("all", alias="statusFilter"),
):
    """Job 목록 조회 (Dashboard/RDB 기반).

    - q: jobId / 파일명 / 상태에 대한 간단한 검색 키워드
    - limit/offset: 페이징
    """

    items = job_store.list_jobs(
        limit=limit,
        offset=offset,
        search=q,
        status_filter=status_filter,
    )
    return {"items": items}


@app.get("/download/{job_id}")
def download(job_id: str):
    path = Path(storage.get_translated_path(job_id))

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="아직 번역이 완료되지 않았거나 없는 job입니다.",
        )

    return FileResponse(path, filename=f"translated_{job_id}.pdf")
