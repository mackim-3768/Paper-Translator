from pathlib import Path
from uuid import uuid4
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from app.config import settings
from app.infra.job_repository import JobRepository
from app.infra.jobs import translate_paper


app = FastAPI(title="Paper Translator API")

BASE_DATA_DIR = Path("/data")
job_store = JobRepository(settings.db_url)


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF만 업로드 가능합니다.")

    job_id = str(uuid4())

    original_dir = BASE_DATA_DIR / "original"
    original_dir.mkdir(parents=True, exist_ok=True)
    dest_path = original_dir / f"{job_id}.pdf"

    contents = await file.read()
    with dest_path.open("wb") as f:
        f.write(contents)

    job_store.create_job(job_id, file_name=file.filename)
    translate_paper.delay(job_id)

    return {"job_id": job_id}


@app.get("/status/{job_id}")
def status(job_id: str):
    current = job_store.get_status(job_id)
    if current is None:
        raise HTTPException(status_code=404, detail="존재하지 않는 job_id")

    return {"job_id": job_id, "status": current}


@app.get("/jobs")
def list_jobs(q: Optional[str] = None, limit: int = 50, offset: int = 0):
    """Job 목록 조회 (Dashboard/RDB 기반).

    - q: jobId / 파일명 / 상태에 대한 간단한 검색 키워드
    - limit/offset: 페이징
    """

    items = job_store.list_jobs(limit=limit, offset=offset, search=q)
    return {"items": items}


@app.get("/download/{job_id}")
def download(job_id: str):
    translated_dir = BASE_DATA_DIR / "translated"
    path = translated_dir / f"{job_id}.pdf"

    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="아직 번역이 완료되지 않았거나 없는 job입니다.",
        )

    return FileResponse(path, filename=f"translated_{job_id}.pdf")
