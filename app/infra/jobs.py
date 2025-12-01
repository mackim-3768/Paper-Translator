from pathlib import Path

from celery import Celery

from app.config import settings
from app.infra.job_store import JobStore
from app.services.translation_service import TranslationService


celery_app = Celery(
    "paper_translator",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

job_store = JobStore(settings.redis_url)
translation_service = TranslationService()


BASE_DATA_DIR = Path("/data")


@celery_app.task(name="translate_paper")
def translate_paper(job_id: str) -> dict:
    """실제 번역 Job.

    /data/original/{job_id}.pdf 를 읽어 LLM 번역 후
    /data/translated/{job_id}.pdf 로 저장한다.
    """

    job_store.set_status(job_id, "RUNNING")

    original_path = BASE_DATA_DIR / "original" / f"{job_id}.pdf"
    translated_dir = BASE_DATA_DIR / "translated"
    translated_dir.mkdir(parents=True, exist_ok=True)
    translated_path = translated_dir / f"{job_id}.pdf"

    if not original_path.exists():
        job_store.set_status(job_id, "FAILED")
        raise FileNotFoundError(f"Original PDF not found for job_id={job_id}")

    try:
        translation_service.translate_pdf(original_path, translated_path)
    except Exception:
        job_store.set_status(job_id, "FAILED")
        raise

    job_store.set_status(job_id, "COMPLETED")
    return {"job_id": job_id, "status": "COMPLETED"}
